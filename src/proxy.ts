import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { resolveClientIp } from "./client-ip.ts";
import type { Config } from "./config.ts";
import { runFilters } from "./filters/pipeline.ts";
import type { Filter } from "./filters/types.ts";
import type { Log } from "./logging.ts";
import { AUTOMATED_BROWSER_EVENT, type ScriptCache } from "./script.ts";
import { EVENT_PATH, SCRIPT_PATH, eventHostname, eventReferrer, forwardHeaders, parseEvent, withClientInfo } from "./umami.ts";

/** Generous, to leave room for custom event data. */
const MAX_EVENT_BYTES = 64 * 1024;

export type AppDeps = {
  config: Config;
  filters: Filter[];
  scriptCache: ScriptCache;
  fetch: typeof fetch;
  upstreamTimeoutMs: number;
  remoteAddress: (c: Context) => string | undefined;
  log: Log;
};

export function createApp({ config, filters, scriptCache, fetch, upstreamTimeoutMs, remoteAddress, log }: AppDeps): Hono {
  const app = new Hono();

  app.get("/", (c) => c.text("OK"));

  app.get(SCRIPT_PATH, async (c) => {
    try {
      const script = await scriptCache.get();
      return c.body(script, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=86400",
      });
    } catch (error) {
      log({ level: "error", msg: "Tracker script unavailable", error: String(error) });
      return c.text("Tracker script unavailable", 502);
    }
  });

  // The tracker posts JSON with custom headers, so cross-origin sites (mode 1) need a CORS preflight answer.
  app.use(EVENT_PATH, cors({ origin: "*", maxAge: 86400 }));

  const limitBody = bodyLimit({ maxSize: MAX_EVENT_BYTES, onError: (c) => c.json({ error: "Event too large" }, 413) });

  app.post(EVENT_PATH, limitBody, async (c) => {
    const event = parseEvent(await c.req.json().catch(() => undefined));
    if (!event) {
      return c.json({ error: "Invalid event" }, 400);
    }

    const hostname = eventHostname(event);
    const userAgent = c.req.header("user-agent") || undefined;
    const ip = resolveClientIp(c.req.raw.headers, remoteAddress(c), config.ipHeader);

    // A dropped event gets an ordinary success response, so neither the tracker nor the bot notices.
    const drop = (reason: string) => {
      log({ level: "info", msg: "drop", reason, ip, userAgent, hostname });
      return c.json({});
    };

    if (event.type === AUTOMATED_BROWSER_EVENT) {
      return drop("automated_browser");
    }
    if (!ip) {
      return drop("missing_ip");
    }
    const reason = runFilters(filters, {
      ip,
      userAgent,
      acceptLanguage: c.req.header("accept-language"),
      referrer: eventReferrer(event),
      origin: c.req.header("origin"),
      hostname,
    });
    if (reason) {
      return drop(reason);
    }

    let upstreamResponse: Response;
    let upstreamBody: string;
    try {
      upstreamResponse = await fetch(`${config.upstream}${EVENT_PATH}`, {
        method: "POST",
        headers: forwardHeaders(c.req.raw.headers),
        body: JSON.stringify(withClientInfo(event, ip, userAgent)),
        signal: AbortSignal.timeout(upstreamTimeoutMs),
      });
      upstreamBody = await upstreamResponse.text();
    } catch (error) {
      log({ level: "error", msg: "Forwarding event failed", error: String(error) });
      return c.json({ error: "Upstream unavailable" }, 502);
    }

    if (upstreamResponse.ok) {
      log({ level: "info", msg: "pass", hostname });
    } else {
      log({ level: "warn", msg: "Umami rejected the event", status: upstreamResponse.status, hostname });
    }

    // Umami's response holds a `cache` token the tracker sends back with later events.
    return new Response(upstreamBody, {
      status: upstreamResponse.status,
      headers: { "content-type": upstreamResponse.headers.get("content-type") ?? "application/json" },
    });
  });

  return app;
}
