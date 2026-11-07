import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { loadConfig } from "./config.ts";
import { downloadLists, type DatacenterLists } from "./filters/datacenter-ip.ts";
import { buildFilters } from "./filters/pipeline.ts";
import { downloadSpamDomains } from "./filters/referrer-spam.ts";
import { isBotUserAgent } from "./filters/ua-bot.ts";
import { logToStdout, withMinLevel } from "./logging.ts";
import { createApp } from "./proxy.ts";
import { startRefreshing, type Store } from "./refresh.ts";
import { createScriptCache } from "./script.ts";
import { SCRIPT_PATH } from "./umami.ts";

const USER_AGENT = "bouncer";
const SCRIPT_TTL_MS = 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 30 * 1000;
const EVENT_TIMEOUT_MS = 10 * 1000;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`GET ${url} returned HTTP ${response.status}`);
  }
  return response.text();
}

const config = loadConfig(process.env);
const log = withMinLevel(config.logLevel, logToStdout);

const datacenterLists: Store<DatacenterLists> = { current: undefined };
if (config.filters.datacenterIps || config.filters.vpnIps) {
  startRefreshing({
    name: "Datacenter and VPN lists",
    store: datacenterLists,
    download: () => downloadLists(fetchText),
    describe: (lists) => ({ datacenterRanges: lists.datacenter.size, vpnRanges: lists.vpn.size }),
    log,
  });
}

const spamDomains: Store<ReadonlySet<string>> = { current: undefined };
if (config.filters.referrerSpam) {
  startRefreshing({
    name: "Referrer spam list",
    store: spamDomains,
    download: () => downloadSpamDomains(fetchText),
    describe: (domains) => ({ domains: domains.size }),
    log,
  });
}

const filters = buildFilters(config.filters, { datacenterLists, spamDomains, isBotUserAgent });

const scriptCache = createScriptCache({
  fetchScript: () => fetchText(`${config.upstream}${SCRIPT_PATH}`),
  now: Date.now,
  ttlMs: SCRIPT_TTL_MS,
  blockAutomatedBrowsers: config.filters.automatedBrowsers,
  log,
});

const app = createApp({
  config,
  filters,
  scriptCache,
  fetch,
  upstreamTimeoutMs: EVENT_TIMEOUT_MS,
  remoteAddress: (c) => getConnInfo(c).remote.address,
  log,
});

const server = serve({ fetch: app.fetch, port: config.server.port, hostname: config.server.host }, (info) => {
  log({ level: "info", msg: `Listening on ${info.address}:${info.port}`, upstream: config.upstream, ipHeader: config.ipHeader });
});

// Docker sends SIGTERM on stop; without a handler Node would wait for the kill timeout.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
