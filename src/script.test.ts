import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import type { LogEntry } from "./logging.ts";
import { createScriptCache, wrapScript } from "./script.ts";

/** Runs a script in a fake browser and reports whether the tracker code ran, and what the script posted. */
function runInBrowser(
  script: string,
  window: Record<string, unknown>,
  currentScript: unknown = { src: "https://bouncer.example.com/script.js" }
) {
  const posts: { url: string; body: unknown }[] = [];
  const context = {
    ran: false,
    window: { navigator: {}, ...window },
    document: { currentScript },
    location: { hostname: "www.example.com" },
    fetch: (url: string, init: { body: string }) => {
      posts.push({ url, body: JSON.parse(init.body) });
      return Promise.resolve();
    },
  };
  runInNewContext(script, context);
  return { ran: context.ran, posts };
}

describe("wrapScript", () => {
  const tracker = "ran = true;";

  test("runs the tracker in a regular browser", () => {
    assert.deepEqual(runInBrowser(wrapScript(tracker), {}), { ran: true, posts: [] });
  });

  test("sends a marker event instead of running the tracker in automated browsers", () => {
    const marker = {
      url: "https://bouncer.example.com/api/send",
      body: { type: "automated_browser", payload: { hostname: "www.example.com" } },
    };
    for (const window of [{ navigator: { webdriver: true } }, { _phantom: {} }, { __nightmare: {} }, { Cypress: {} }]) {
      assert.deepEqual(runInBrowser(wrapScript(tracker), window), { ran: false, posts: [marker] });
    }
  });

  test("sends nothing in automated browsers when the script element is unknown", () => {
    assert.deepEqual(runInBrowser(wrapScript(tracker), { navigator: { webdriver: true } }, null), { ran: false, posts: [] });
  });

  test("still works when the tracker ends in a line comment", () => {
    assert.equal(runInBrowser(wrapScript("ran = true; //# sourceMappingURL=script.js.map"), {}).ran, true);
  });
});

describe("createScriptCache", () => {
  function setup(responses: (string | Error | Promise<string>)[], blockAutomatedBrowsers = true) {
    let time = 0;
    let fetches = 0;
    const entries: LogEntry[] = [];
    const cache = createScriptCache({
      fetchScript: async () => {
        const response = responses[Math.min(fetches++, responses.length - 1)]!;
        if (response instanceof Error) {
          throw response;
        }
        return response;
      },
      now: () => time,
      ttlMs: 1000,
      blockAutomatedBrowsers,
      log: (entry) => entries.push(entry),
    });
    return { cache, entries, fetches: () => fetches, advance: (ms: number) => (time += ms) };
  }

  test("serves the wrapped script and reuses it until it expires, then fetches a fresh copy in the background", async () => {
    const { cache, fetches, advance } = setup(["v1", "v2"]);
    assert.equal(await cache.get(), wrapScript("v1"));
    advance(999);
    assert.equal(await cache.get(), wrapScript("v1"));
    assert.equal(fetches(), 1);
    advance(1);
    assert.equal(await cache.get(), wrapScript("v1"));
    await setImmediate();
    assert.equal(fetches(), 2);
    assert.equal(await cache.get(), wrapScript("v2"));
  });

  test("serves the expired script without waiting for the fresh copy", async () => {
    const { cache, fetches, advance } = setup(["v1", new Promise<string>(() => {})]);
    await cache.get();
    advance(1000);
    assert.equal(await cache.get(), wrapScript("v1"));
    assert.equal(await cache.get(), wrapScript("v1"));
    assert.equal(fetches(), 2);
  });

  test("serves the script unchanged when automated browsers aren't blocked", async () => {
    const { cache } = setup(["v1"], false);
    assert.equal(await cache.get(), "v1");
  });

  test("keeps serving the old script when a refresh fails", async () => {
    const { cache, entries, advance } = setup(["v1", new Error("upstream down")]);
    await cache.get();
    advance(1000);
    assert.equal(await cache.get(), wrapScript("v1"));
    await setImmediate();
    assert.equal(entries[0]?.level, "warn");
  });

  test("fails when there is no script to fall back on", async () => {
    const { cache } = setup([new Error("upstream down")]);
    await assert.rejects(cache.get(), /upstream down/);
  });

  test("shares one fetch between requests that arrive together", async () => {
    const { cache, fetches } = setup(["v1"]);
    const scripts = await Promise.all([cache.get(), cache.get(), cache.get()]);
    assert.deepEqual(scripts, [wrapScript("v1"), wrapScript("v1"), wrapScript("v1")]);
    assert.equal(fetches(), 1);
  });
});
