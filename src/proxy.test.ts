import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseConfig } from "./config.ts";
import type { Filter } from "./filters/types.ts";
import type { LogEntry } from "./logging.ts";
import { createApp } from "./proxy.ts";
import type { ScriptCache } from "./script.ts";

type UpstreamCall = { url: string; headers: Headers; body: unknown; signal: AbortSignal | null | undefined };

const BROWSER_HEADERS = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://www.example.com",
  "x-client-real-ip": "203.0.113.9",
};

const EVENT = { type: "event", payload: { website: "abc", hostname: "www.example.com", url: "/", ip: "1.1.1.1" } };

function setup(
  options: {
    filters?: Filter[];
    ipHeader?: string | null;
    upstream?: (call: UpstreamCall) => Response | Promise<Response>;
    script?: ScriptCache;
  } = {}
) {
  const calls: UpstreamCall[] = [];
  const entries: LogEntry[] = [];
  const upstream = options.upstream ?? (() => Response.json({ cache: "token" }));

  const app = createApp({
    config: parseConfig({
      upstream: "https://umami.example.com",
      ip_header: options.ipHeader === undefined ? "x-client-real-ip" : options.ipHeader,
    }),
    filters: options.filters ?? [],
    scriptCache: options.script ?? { get: async () => "tracker();" },
    fetch: async (input, init) => {
      const call = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)), signal: init?.signal };
      calls.push(call);
      return upstream(call);
    },
    upstreamTimeoutMs: 10,
    remoteAddress: () => "198.51.100.7",
    log: (entry) => entries.push(entry),
  });

  const send = (body: unknown = EVENT, headers: Record<string, string> = BROWSER_HEADERS) =>
    app.request("/api/send", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

  return { app, calls, entries, send };
}

describe("GET /script.js", () => {
  test("serves the tracker script", async () => {
    const response = await setup().app.request("/script.js");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/javascript; charset=utf-8");
    assert.equal(await response.text(), "tracker();");
  });

  test("returns 502 when the script is unavailable", async () => {
    const { app, entries } = setup({
      script: {
        get: async () => {
          throw new Error("upstream down");
        },
      },
    });
    assert.equal((await app.request("/script.js")).status, 502);
    assert.equal(entries[0]?.level, "error");
  });
});

describe("POST /api/send", () => {
  test("forwards a passing event with the visitor IP and user agent, and returns the upstream response", async () => {
    const { calls, entries, send } = setup();
    const response = await send();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cache: "token" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://umami.example.com/api/send");
    assert.deepEqual(calls[0]?.body, {
      type: "event",
      payload: { ...EVENT.payload, ip: "203.0.113.9", userAgent: BROWSER_HEADERS["user-agent"] },
    });
    assert.equal(calls[0]?.headers.get("x-client-real-ip"), null);
    assert.deepEqual(entries, [{ level: "info", msg: "pass", hostname: "www.example.com" }]);
  });

  test("uses the connection IP when no IP header is configured", async () => {
    const { calls, send } = setup({ ipHeader: null });
    await send();
    assert.equal((calls[0]?.body as typeof EVENT).payload.ip, "198.51.100.7");
  });

  test("passes the upstream status through, and logs a rejected event as a problem", async () => {
    const { entries, send } = setup({ upstream: () => Response.json({ error: "Bad request" }, { status: 400 }) });
    assert.equal((await send()).status, 400);
    assert.deepEqual(entries, [{ level: "warn", msg: "Umami rejected the event", status: 400, hostname: "www.example.com" }]);
  });

  test("drops an event a filter rejects, without contacting the upstream", async () => {
    const { calls, entries, send } = setup({ filters: [() => undefined, () => "bot_user_agent"] });
    const response = await send();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {});
    assert.equal(calls.length, 0);
    assert.deepEqual(entries, [
      {
        level: "info",
        msg: "drop",
        reason: "bot_user_agent",
        ip: "203.0.113.9",
        userAgent: BROWSER_HEADERS["user-agent"],
        hostname: "www.example.com",
      },
    ]);
  });

  test("drops the marker event from automated browsers, without contacting the upstream", async () => {
    const { calls, entries, send } = setup();
    const response = await send({ type: "automated_browser", payload: { hostname: "www.example.com" } });

    assert.deepEqual(await response.json(), {});
    assert.equal(calls.length, 0);
    assert.deepEqual(entries, [
      {
        level: "info",
        msg: "drop",
        reason: "automated_browser",
        ip: "203.0.113.9",
        userAgent: BROWSER_HEADERS["user-agent"],
        hostname: "www.example.com",
      },
    ]);
  });

  test("gives the filters the request details", async () => {
    let seen: unknown;
    const { send } = setup({
      filters: [
        (event) => {
          seen = event;
          return undefined;
        },
      ],
    });
    await send({ type: "event", payload: { hostname: "www.example.com", referrer: "https://www.google.com/" } });
    assert.deepEqual(seen, {
      ip: "203.0.113.9",
      userAgent: BROWSER_HEADERS["user-agent"],
      acceptLanguage: "en-US,en;q=0.9",
      referrer: "https://www.google.com/",
      origin: "https://www.example.com",
      hostname: "www.example.com",
    });
  });

  test("drops an event when the configured IP header is missing", async () => {
    const { calls, entries, send } = setup();
    const headers = Object.fromEntries(Object.entries(BROWSER_HEADERS).filter(([name]) => name !== "x-client-real-ip"));
    assert.deepEqual(await (await send(EVENT, headers)).json(), {});
    assert.equal(calls.length, 0);
    assert.equal(entries[0]?.reason, "missing_ip");
  });

  test("rejects a body that is not a tracker event", async () => {
    const { calls, send } = setup();
    assert.equal((await send("not json")).status, 400);
    assert.equal((await send({ type: "event" })).status, 400);
    assert.equal(calls.length, 0);
  });

  test("returns 502 when the upstream doesn't answer in time", async () => {
    const { entries, send } = setup({
      upstream: ({ signal }) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason))),
    });
    assert.equal((await send()).status, 502);
    assert.equal(entries[0]?.level, "error");
  });

  test("returns 502 when the upstream response breaks off", async () => {
    const { entries, send } = setup({
      upstream: () => new Response(new ReadableStream({ start: (controller) => controller.error(new Error("connection reset")) })),
    });
    assert.equal((await send()).status, 502);
    assert.equal(entries[0]?.level, "error");
  });
});
