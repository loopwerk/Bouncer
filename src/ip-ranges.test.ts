import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseRangeList, rangeSetHas } from "./ip-ranges.ts";

describe("parseRangeList and rangeSetHas", () => {
  test("matches IPv4 ranges up to and including their edges", () => {
    const set = parseRangeList("203.0.113.0/24\n");
    assert.equal(rangeSetHas(set, "203.0.113.0"), true);
    assert.equal(rangeSetHas(set, "203.0.113.255"), true);
    assert.equal(rangeSetHas(set, "203.0.112.255"), false);
    assert.equal(rangeSetHas(set, "203.0.114.0"), false);
  });

  test("matches IPv6 ranges", () => {
    const set = parseRangeList("2001:db8::/32");
    assert.equal(rangeSetHas(set, "2001:db8:ffff::1"), true);
    assert.equal(rangeSetHas(set, "2001:db9::1"), false);
  });

  test("keeps IPv4 and IPv6 apart", () => {
    // ::cb00:7100 has the same numeric value as 203.0.113.0, but is a different address.
    const set = parseRangeList("203.0.113.0/24");
    assert.equal(rangeSetHas(set, "::cb00:7100"), false);
  });

  test("looks up IPv4-mapped IPv6 addresses as IPv4", () => {
    assert.equal(rangeSetHas(parseRangeList("203.0.113.0/24"), "::ffff:203.0.113.9"), true);
  });

  test("treats an entry without a prefix as a single address", () => {
    const set = parseRangeList("203.0.113.9\n2001:db8::1");
    assert.equal(rangeSetHas(set, "203.0.113.9"), true);
    assert.equal(rangeSetHas(set, "203.0.113.10"), false);
    assert.equal(rangeSetHas(set, "2001:db8::1"), true);
    assert.equal(rangeSetHas(set, "2001:db8::2"), false);
  });

  test("aligns a range whose address has host bits set", () => {
    const set = parseRangeList("203.0.113.77/24");
    assert.equal(rangeSetHas(set, "203.0.113.1"), true);
  });

  test("handles overlapping, nested and adjacent ranges", () => {
    const set = parseRangeList("10.0.0.0/8\n10.1.0.0/16\n11.0.0.0/8\n192.0.2.0/25\n192.0.2.64/26\n198.51.100.0/24");
    assert.equal(rangeSetHas(set, "10.1.2.3"), true);
    assert.equal(rangeSetHas(set, "11.255.255.255"), true);
    assert.equal(rangeSetHas(set, "192.0.2.100"), true);
    assert.equal(rangeSetHas(set, "192.0.2.200"), false);
    assert.equal(rangeSetHas(set, "198.51.100.50"), true);
    assert.equal(rangeSetHas(set, "12.0.0.0"), false);
  });

  test("skips blank lines, comments and invalid entries", () => {
    const set = parseRangeList("# comment\n\n  203.0.113.0/24  \nnot-an-ip\n203.0.113.0/33\n198.51.100.0/\n198.51.100.0/24/1\n");
    assert.equal(set.size, 1);
    assert.equal(rangeSetHas(set, "203.0.113.9"), true);
  });

  test("matches nothing when the list is empty", () => {
    const set = parseRangeList("");
    assert.equal(set.size, 0);
    assert.equal(rangeSetHas(set, "203.0.113.9"), false);
  });

  test("does not match an invalid lookup address", () => {
    assert.equal(rangeSetHas(parseRangeList("0.0.0.0/0"), "unknown"), false);
  });
});
