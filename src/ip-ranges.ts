import ipaddr from "ipaddr.js";
import { isIP } from "node:net";

/** Sorted, non-overlapping ranges, so a lookup is a binary search. */
type Ranges = { starts: bigint[]; ends: bigint[] };

export type IpRangeSet = {
  ipv4: Ranges;
  ipv6: Ranges;
  /** Number of valid entries in the source list. */
  size: number;
};

/** Parses a list with one IP or CIDR range per line. Blank lines, `#` comments and invalid entries are skipped. */
export function parseRangeList(text: string): IpRangeSet {
  const ipv4: [bigint, bigint][] = [];
  const ipv6: [bigint, bigint][] = [];

  for (const line of text.split("\n")) {
    const entry = line.trim();
    if (entry === "" || entry.startsWith("#")) {
      continue;
    }

    const range = parseRange(entry);
    if (!range) {
      continue;
    }

    (range.kind === "ipv4" ? ipv4 : ipv6).push([range.start, range.end]);
  }

  return { ipv4: mergeRanges(ipv4), ipv6: mergeRanges(ipv6), size: ipv4.length + ipv6.length };
}

export function rangeSetHas(set: IpRangeSet, ip: string): boolean {
  if (isIP(ip) === 0) {
    return false;
  }
  const address = ipaddr.process(ip);
  return rangesHave(address.kind() === "ipv4" ? set.ipv4 : set.ipv6, toBigInt(address));
}

function parseRange(entry: string): { kind: "ipv4" | "ipv6"; start: bigint; end: bigint } | undefined {
  const [address, prefixText, ...rest] = entry.split("/");
  if (!address || rest.length > 0 || isIP(address) === 0) {
    return undefined;
  }

  if (prefixText !== undefined && !/^\d+$/.test(prefixText)) {
    return undefined;
  }

  const ip = ipaddr.parse(address);
  const kind = ip.kind();
  const bits = kind === "ipv4" ? 32 : 128;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (prefix > bits) {
    return undefined;
  }

  const size = 1n << BigInt(bits - prefix);
  const start = (toBigInt(ip) / size) * size;
  return { kind, start, end: start + size - 1n };
}

function mergeRanges(ranges: [bigint, bigint][]): Ranges {
  ranges.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const starts: bigint[] = [];
  const ends: bigint[] = [];

  for (const [start, end] of ranges) {
    const last = ends.length - 1;
    if (last >= 0 && start <= ends[last]! + 1n) {
      if (end > ends[last]!) {
        ends[last] = end;
      }
    } else {
      starts.push(start);
      ends.push(end);
    }
  }

  return { starts, ends };
}

function rangesHave({ starts, ends }: Ranges, value: bigint): boolean {
  // Find the last range that starts at or before the value.
  let low = 0;
  let high = starts.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle]! <= value) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found >= 0 && value <= ends[found]!;
}

function toBigInt(address: ipaddr.IPv4 | ipaddr.IPv6): bigint {
  return address.toByteArray().reduce((total, byte) => (total << 8n) | BigInt(byte), 0n);
}
