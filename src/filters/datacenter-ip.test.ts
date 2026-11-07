import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Store } from "../refresh.ts";
import { LIST_URLS, createDatacenterFilter, downloadLists, type DatacenterLists } from "./datacenter-ip.ts";
import type { EventInfo } from "./types.ts";

// 203.0.113.0/24 is a hosting provider, 198.51.100.0/24 a VPN provider that is in both X4BNet lists.
const LISTS: Record<string, string> = {
  [LIST_URLS.datacenter[0]!]: "203.0.113.0/24\n198.51.100.0/24\n",
  [LIST_URLS.datacenter[1]!]: "2001:db8:1::/48\n",
  [LIST_URLS.vpn[0]!]: "198.51.100.0/24\n",
  [LIST_URLS.vpn[1]!]: "2001:db8:2::/48\n",
};

async function fetchLists(url: string): Promise<string> {
  const text = LISTS[url];
  if (text === undefined) {
    throw new Error(`Unexpected URL ${url}`);
  }
  return text;
}

function event(ip: string): EventInfo {
  return { ip, userAgent: "Mozilla/5.0", acceptLanguage: "en", referrer: undefined, origin: undefined, hostname: undefined };
}

async function loadedStore(): Promise<Store<DatacenterLists>> {
  return { current: await downloadLists(fetchLists) };
}

describe("downloadLists", () => {
  test("combines the IPv4 and IPv6 files of each list", async () => {
    const lists = await downloadLists(fetchLists);
    assert.equal(lists.datacenter.size, 3);
    assert.equal(lists.vpn.size, 2);
  });

  test("fails when a list has no valid entries", async () => {
    await assert.rejects(
      downloadLists(async (url) => (url.includes("/vpn/") ? "<html>Not found</html>" : fetchLists(url))),
      /no valid entries/
    );
  });
});

describe("createDatacenterFilter", () => {
  test("drops hosting IPs but keeps VPN IPs by default", async () => {
    const filter = createDatacenterFilter(await loadedStore(), { datacenterIps: true, vpnIps: false });
    assert.equal(filter(event("203.0.113.9")), "datacenter_ip");
    assert.equal(filter(event("2001:db8:1::9")), "datacenter_ip");
    assert.equal(filter(event("198.51.100.9")), undefined);
    assert.equal(filter(event("2001:db8:2::9")), undefined);
    assert.equal(filter(event("192.0.2.9")), undefined);
  });

  test("drops hosting and VPN IPs when both are enabled", async () => {
    const filter = createDatacenterFilter(await loadedStore(), { datacenterIps: true, vpnIps: true });
    assert.equal(filter(event("203.0.113.9")), "datacenter_ip");
    assert.equal(filter(event("198.51.100.9")), "vpn_ip");
    assert.equal(filter(event("2001:db8:2::9")), "vpn_ip");
    assert.equal(filter(event("192.0.2.9")), undefined);
  });

  test("drops only VPN IPs when datacenter filtering is off", async () => {
    const filter = createDatacenterFilter(await loadedStore(), { datacenterIps: false, vpnIps: true });
    assert.equal(filter(event("203.0.113.9")), undefined);
    assert.equal(filter(event("198.51.100.9")), "vpn_ip");
  });

  test("passes everything until the lists are loaded", () => {
    const filter = createDatacenterFilter({ current: undefined }, { datacenterIps: true, vpnIps: true });
    assert.equal(filter(event("203.0.113.9")), undefined);
  });
});
