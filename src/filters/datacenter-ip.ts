import { parseRangeList, rangeSetHas, type IpRangeSet } from "../ip-ranges.ts";
import type { FetchText, Store } from "../refresh.ts";
import type { Filter } from "./types.ts";

const LIST_BASE = "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output";

export const LIST_URLS = {
  datacenter: [`${LIST_BASE}/datacenter/ipv4.txt`, `${LIST_BASE}/datacenter/ipv6.txt`],
  vpn: [`${LIST_BASE}/vpn/ipv4.txt`, `${LIST_BASE}/vpn/ipv6.txt`],
};

/** The X4BNet "datacenter" list includes VPN providers; the "vpn" list has only those. */
export type DatacenterLists = { datacenter: IpRangeSet; vpn: IpRangeSet };

export async function downloadLists(fetchText: FetchText): Promise<DatacenterLists> {
  const parseList = async (urls: string[]) => parseRangeList((await Promise.all(urls.map(fetchText))).join("\n"));
  const [datacenter, vpn] = await Promise.all([parseList(LIST_URLS.datacenter), parseList(LIST_URLS.vpn)]);
  if (datacenter.size === 0 || vpn.size === 0) {
    throw new Error("Downloaded IP list has no valid entries");
  }
  return { datacenter, vpn };
}

/** Passes everything until the lists are downloaded. */
export function createDatacenterFilter(store: Store<DatacenterLists>, options: { datacenterIps: boolean; vpnIps: boolean }): Filter {
  return (event) => {
    const lists = store.current;
    if (!lists) {
      return undefined;
    }

    const inVpnList = rangeSetHas(lists.vpn, event.ip);
    if (options.vpnIps && inVpnList) {
      return "vpn_ip";
    }
    if (options.datacenterIps && !inVpnList && rangeSetHas(lists.datacenter, event.ip)) {
      return "datacenter_ip";
    }
    return undefined;
  };
}
