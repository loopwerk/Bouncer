import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeIp, resolveClientIp } from "./client-ip.ts";

describe("resolveClientIp", () => {
  test("uses the connection IP when no header is configured", () => {
    assert.equal(resolveClientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }), "198.51.100.7", undefined), "198.51.100.7");
  });

  test("uses only the configured header when one is set", () => {
    const headers = new Headers({ "X-Client-Real-IP": "203.0.113.9" });
    assert.equal(resolveClientIp(headers, "198.51.100.7", "x-client-real-ip"), "203.0.113.9");
  });

  test("takes the first entry of a list header", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.1, 10.0.0.1" });
    assert.equal(resolveClientIp(headers, "10.0.0.2", "x-forwarded-for"), "203.0.113.9");
  });

  test("does not fall back to the connection IP when the configured header is missing", () => {
    assert.equal(resolveClientIp(new Headers(), "198.51.100.7", "cf-connecting-ip"), undefined);
  });

  test("returns undefined for an invalid header value", () => {
    assert.equal(resolveClientIp(new Headers({ "cf-connecting-ip": "unknown" }), undefined, "cf-connecting-ip"), undefined);
  });
});

describe("normalizeIp", () => {
  test("converts IPv4-mapped IPv6 to IPv4", () => {
    assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
  });

  test("writes IPv6 in compressed form", () => {
    assert.equal(normalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  });

  test("trims whitespace and rejects non-IPs", () => {
    assert.equal(normalizeIp(" 203.0.113.9 "), "203.0.113.9");
    assert.equal(normalizeIp("203.0.113"), undefined);
    assert.equal(normalizeIp(""), undefined);
    assert.equal(normalizeIp(undefined), undefined);
  });
});
