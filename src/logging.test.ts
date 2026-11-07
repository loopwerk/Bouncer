import assert from "node:assert/strict";
import { test } from "node:test";
import { withMinLevel, type LogEntry } from "./logging.ts";

test("withMinLevel passes entries at or above the level", () => {
  const written: LogEntry[] = [];
  const log = withMinLevel("warn", (entry) => written.push(entry));

  log({ level: "info", msg: "pass" });
  log({ level: "warn", msg: "stale script" });
  log({ level: "error", msg: "upstream down" });

  assert.deepEqual(
    written.map((entry) => entry.msg),
    ["stale script", "upstream down"]
  );
});
