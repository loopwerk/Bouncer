import autocannon from "autocannon";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, openSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

const BOUNCER_PORT = 3200;
const UPSTREAM_PORT = 3201;
const CONNECTIONS = 50;
const WARMUP_SECONDS = 3;
const DURATION_SECONDS = 10;

const UPSTREAM_RESPONSE = JSON.stringify({ cache: "token" });
const TRACKER_SCRIPT = "/* tracker */\n".repeat(200);

const BROWSER_HEADERS = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://www.example.com",
  "x-client-real-ip": "192.0.2.10",
};

const EVENT = JSON.stringify({
  type: "event",
  payload: {
    website: "00000000-0000-0000-0000-000000000000",
    hostname: "www.example.com",
    url: "https://www.example.com/",
    referrer: "https://www.google.com/",
    title: "Home",
    language: "en-US",
    screen: "1920x1080",
  },
});

type Scenario = {
  name: string;
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  body?: string;
  /** A different response body counts as a failure, which proves the request took the intended path. */
  expectBody?: string;
};

const SCENARIOS: Scenario[] = [
  { name: "GET /", method: "GET", path: "/", expectBody: "OK" },
  { name: "GET /script.js", method: "GET", path: "/script.js" },
  {
    name: "POST /api/send (bot, dropped)",
    method: "POST",
    path: "/api/send",
    headers: { ...BROWSER_HEADERS, "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    body: EVENT,
    expectBody: "{}",
  },
  {
    name: "POST /api/send (visitor, forwarded)",
    method: "POST",
    path: "/api/send",
    headers: BROWSER_HEADERS,
    body: EVENT,
    expectBody: UPSTREAM_RESPONSE,
  },
];

/** Stands in for Umami and answers right away, so the numbers measure Bouncer alone. */
function runUpstream(): void {
  const server = createServer((req, res) => {
    if (req.url === "/script.js") {
      res.writeHead(200, { "content-type": "application/javascript" }).end(TRACKER_SCRIPT);
      return;
    }
    req.resume().on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(UPSTREAM_RESPONSE));
  });
  server.listen(UPSTREAM_PORT, "127.0.0.1", () => parentPort?.postMessage("listening"));
}

/** Waits until Bouncer listens and has downloaded its IP and spam lists, so every filter is active. */
async function waitUntilReady(logPath: string, bouncer: ReturnType<typeof spawn>): Promise<void> {
  const ready = ["Listening on", "Datacenter and VPN lists updated", "Referrer spam list updated"];
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const log = readFileSync(logPath, "utf8");
    if (bouncer.exitCode !== null || log.includes("download failed")) {
      throw new Error(`Bouncer failed to start:\n${log}`);
    }
    if (ready.every((message) => log.includes(message))) {
      return;
    }
    await sleep(200);
  }
  throw new Error("Bouncer wasn't ready within 60 seconds");
}

async function main(): Promise<void> {
  const upstream = new Worker(new URL(import.meta.url));
  await once(upstream, "message");

  // Bouncer runs in an empty directory, so a local bouncer.config.yml doesn't change the setup.
  const workDir = mkdtempSync(join(tmpdir(), "bouncer-bench-"));
  const logPath = join(workDir, "bouncer.log");
  const bouncer = spawn(process.execPath, [join(import.meta.dirname, "../src/index.ts")], {
    cwd: workDir,
    env: {
      BOUNCER_UPSTREAM: `http://127.0.0.1:${UPSTREAM_PORT}`,
      BOUNCER_IP_HEADER: "x-client-real-ip",
      BOUNCER_PORT: String(BOUNCER_PORT),
      BOUNCER_HOST: "127.0.0.1",
    },
    // A file, like a Docker log pipe on Linux, makes Node write logs synchronously.
    stdio: ["ignore", openSync(logPath, "w"), "inherit"],
  });

  try {
    await waitUntilReady(logPath, bouncer);
    console.log(`Node ${process.version}, ${cpus()[0]?.model}, ${CONNECTIONS} connections, ${DURATION_SECONDS}s per scenario`);

    const rows = [];
    for (const { name, path, ...request } of SCENARIOS) {
      const options = { url: `http://127.0.0.1:${BOUNCER_PORT}${path}`, connections: CONNECTIONS, ...request };
      await autocannon({ ...options, duration: WARMUP_SECONDS });
      const result = await autocannon({ ...options, duration: DURATION_SECONDS });
      rows.push({
        scenario: name,
        "req/s": Math.round(result.requests.average),
        "p50 ms": result.latency.p50,
        "p99 ms": result.latency.p99,
        failures: result.errors + result.timeouts + result.non2xx + result.mismatches,
      });
    }
    console.table(rows);
  } finally {
    bouncer.kill();
    await upstream.terminate();
  }
}

if (isMainThread) {
  await main();
} else {
  runUpstream();
}
