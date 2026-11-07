import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { originMismatchFilter } from "./origin-mismatch.ts";

const event = (origin: string | undefined) => ({
  ip: "192.0.2.1",
  userAgent: "Mozilla/5.0",
  acceptLanguage: "en",
  referrer: undefined,
  origin,
  hostname: "www.example.com",
});

describe("originMismatchFilter", () => {
  test("passes events whose Origin matches the event's hostname", () => {
    assert.equal(originMismatchFilter(event("https://www.example.com")), undefined);
    assert.equal(originMismatchFilter(event("https://www.example.com:8443")), undefined);
  });

  test("drops events without an Origin", () => {
    assert.equal(originMismatchFilter(event(undefined)), "missing_origin");
    assert.equal(originMismatchFilter(event("")), "missing_origin");
  });

  test("drops events whose Origin is another site or not a URL", () => {
    assert.equal(originMismatchFilter(event("https://example.com")), "origin_mismatch");
    assert.equal(originMismatchFilter({ ...event("https://www.example.com"), hostname: undefined }), "origin_mismatch");
    assert.equal(originMismatchFilter(event("www.example.com")), "origin_mismatch");
    assert.equal(originMismatchFilter(event("null")), "origin_mismatch");
  });
});
