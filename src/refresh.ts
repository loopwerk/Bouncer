import type { Log } from "./logging.ts";

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export type FetchText = (url: string) => Promise<string>;

/** Holds the latest downloaded data; empty until the first download succeeds. */
export type Store<T> = { current: T | undefined };

export type RefreshOptions<T> = {
  /** Used in log messages, e.g. "Referrer spam list". */
  name: string;
  store: Store<T>;
  download: () => Promise<T>;
  /** Extra fields for the log line after a successful download. */
  describe: (data: T) => Record<string, unknown>;
  log: Log;
};

/** Replaces the data in the store. When the download fails, the previous data stays in use. */
export async function refresh<T>({ name, store, download, describe, log }: RefreshOptions<T>): Promise<boolean> {
  try {
    store.current = await download();
    log({ level: "info", msg: `${name} updated`, ...describe(store.current) });
    return true;
  } catch (error) {
    log({ level: "error", msg: `${name} download failed`, error: String(error) });
    return false;
  }
}

/** Downloads now, then daily. A failed download is retried after a few minutes. */
export function startRefreshing<T>(options: RefreshOptions<T>): void {
  const run = async () => {
    const ok = await refresh(options);
    setTimeout(run, ok ? REFRESH_INTERVAL_MS : RETRY_INTERVAL_MS).unref();
  };
  void run();
}
