import type { Log } from "./logging.ts";
import { EVENT_PATH } from "./umami.ts";

/** The same check Plausible's tracker does: these are set in browsers controlled by automation tools. */
const AUTOMATION_CHECK = "window._phantom || window.__nightmare || window.navigator.webdriver || window.Cypress";

/** The event type automated browsers send instead of running the tracker. */
export const AUTOMATED_BROWSER_EVENT = "automated_browser";

/**
 * Wraps the tracker so automated browsers don't run it. They post a marker event to the `/api/send` next to
 * the script instead, so Bouncer can log the drop. A plain `if` keeps the code synchronous, so it can still
 * read `document.currentScript`. The newline before `}` ends any trailing `//` comment.
 */
export function wrapScript(source: string): string {
  return `if (${AUTOMATION_CHECK}) {
  const script = document.currentScript;
  if (script) {
    const url = script.src.split("/").slice(0, -1).join("/") + "${EVENT_PATH}";
    const body = JSON.stringify({ type: "${AUTOMATED_BROWSER_EVENT}", payload: { hostname: location.hostname } });
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }
} else {
${source}
}
`;
}

export type ScriptCache = { get(): Promise<string> };

export type ScriptCacheOptions = {
  fetchScript: () => Promise<string>;
  now: () => number;
  ttlMs: number;
  /** Whether to wrap the tracker with `wrapScript`. */
  blockAutomatedBrowsers: boolean;
  log: Log;
};

/**
 * Keeps the tracker in memory. Once the copy is older than `ttlMs`, requests still get it right away while
 * a fresh copy downloads in the background; when that download fails, the old copy stays. Only requests
 * that arrive before the first download finishes wait, and they share that download.
 */
export function createScriptCache({ fetchScript, now, ttlMs, blockAutomatedBrowsers, log }: ScriptCacheOptions): ScriptCache {
  let cached: { script: string; fetchedAt: number } | undefined;
  let pending: Promise<string> | undefined;

  async function refresh(): Promise<string> {
    try {
      const source = await fetchScript();
      const script = blockAutomatedBrowsers ? wrapScript(source) : source;
      cached = { script, fetchedAt: now() };
      return script;
    } catch (error) {
      if (!cached) {
        throw error;
      }
      log({ level: "warn", msg: "Tracker script fetch failed, serving cached copy", error: String(error) });
      return cached.script;
    }
  }

  function startRefresh(): Promise<string> {
    pending ??= refresh().finally(() => {
      pending = undefined;
    });
    return pending;
  }

  return {
    get() {
      if (!cached) {
        return startRefresh();
      }
      if (now() - cached.fetchedAt >= ttlMs) {
        // Can't reject: with a cached copy, `refresh` falls back to it.
        void startRefresh();
      }
      return Promise.resolve(cached.script);
    },
  };
}
