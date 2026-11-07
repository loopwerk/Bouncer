import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LogEntry } from "./logging.ts";
import { refresh, type Store } from "./refresh.ts";

function setup(download: () => Promise<string[]>, store: Store<string[]> = { current: undefined }) {
  const entries: LogEntry[] = [];
  const run = () =>
    refresh({ name: "Test list", store, download, describe: (data) => ({ entries: data.length }), log: (entry) => entries.push(entry) });
  return { store, entries, run };
}

describe("refresh", () => {
  test("stores the downloaded data and logs a summary", async () => {
    const { store, entries, run } = setup(async () => ["a", "b"]);
    assert.equal(await run(), true);
    assert.deepEqual(store.current, ["a", "b"]);
    assert.deepEqual(entries, [{ level: "info", msg: "Test list updated", entries: 2 }]);
  });

  test("keeps the previous data and logs an error when the download fails", async () => {
    const previous = ["old"];
    const { store, entries, run } = setup(
      async () => {
        throw new Error("network down");
      },
      { current: previous }
    );
    assert.equal(await run(), false);
    assert.equal(store.current, previous);
    assert.equal(entries[0]?.level, "error");
    assert.equal(entries[0]?.msg, "Test list download failed");
    assert.match(String(entries[0]?.error), /network down/);
  });
});
