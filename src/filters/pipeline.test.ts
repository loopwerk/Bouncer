import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { FilterConfig } from "../config.ts";
import { parseRangeList } from "../ip-ranges.ts";
import { buildFilters, runFilters, type FilterDeps } from "./pipeline.ts";
import type { EventInfo } from "./types.ts";

const ALL_OFF: FilterConfig = {
  automatedBrowsers: false,
  datacenterIps: false,
  vpnIps: false,
  uaBotDetection: false,
  referrerSpam: false,
  headerAnomalies: false,
  originMismatch: false,
};

const DEPS: FilterDeps = {
  datacenterLists: { current: { datacenter: parseRangeList("203.0.113.0/24"), vpn: parseRangeList("198.51.100.0/24") } },
  spamDomains: { current: new Set(["spam.example"]) },
  isBotUserAgent: (userAgent) => userAgent.includes("bot"),
};

const HUMAN: EventInfo = {
  ip: "192.0.2.1",
  userAgent: "Mozilla/5.0",
  acceptLanguage: "en",
  referrer: "https://www.google.com/",
  origin: "https://www.example.com",
  hostname: "www.example.com",
};

/** An event that every filter would drop. */
const SUSPICIOUS: EventInfo = {
  ip: "203.0.113.9",
  userAgent: "bot",
  acceptLanguage: undefined,
  referrer: "https://spam.example/",
  origin: undefined,
  hostname: "www.example.com",
};

describe("buildFilters", () => {
  test("builds no filters when everything is off", () => {
    assert.deepEqual(buildFilters(ALL_OFF, DEPS), []);
  });

  test("runs the enabled filters in order: user agent, IP, referrer, headers, origin", () => {
    const run = (config: Partial<FilterConfig>, event: EventInfo) => runFilters(buildFilters({ ...ALL_OFF, ...config }, DEPS), event);
    const all = { uaBotDetection: true, datacenterIps: true, referrerSpam: true, headerAnomalies: true, originMismatch: true };

    assert.equal(run(all, SUSPICIOUS), "bot_user_agent");
    assert.equal(run({ ...all, uaBotDetection: false }, SUSPICIOUS), "datacenter_ip");
    assert.equal(run({ referrerSpam: true, headerAnomalies: true }, SUSPICIOUS), "referrer_spam");
    assert.equal(run({ headerAnomalies: true, originMismatch: true }, SUSPICIOUS), "missing_accept_language");
    assert.equal(run({ originMismatch: true }, SUSPICIOUS), "missing_origin");
    assert.equal(run(all, HUMAN), undefined);
  });

  test("adds the IP filter when only VPN filtering is on", () => {
    const filters = buildFilters({ ...ALL_OFF, vpnIps: true }, DEPS);
    assert.equal(runFilters(filters, { ...HUMAN, ip: "198.51.100.9" }), "vpn_ip");
    assert.equal(runFilters(filters, { ...HUMAN, ip: "203.0.113.9" }), undefined);
  });
});
