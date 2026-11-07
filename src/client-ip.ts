import ipaddr from "ipaddr.js";
import { isIP } from "node:net";

/**
 * Returns the visitor IP, or undefined when it can't be determined.
 * With `ipHeader` set, only that header counts: falling back to the connection IP would record the proxy's IP instead.
 */
export function resolveClientIp(headers: Headers, remoteAddress: string | undefined, ipHeader: string | undefined): string | undefined {
  // A header like X-Forwarded-For can hold a list; the first entry is the visitor.
  const value = ipHeader ? headers.get(ipHeader)?.split(",")[0] : remoteAddress;
  return normalizeIp(value);
}

/** Validates an IP and converts IPv4-mapped IPv6 addresses (`::ffff:1.2.3.4`) to plain IPv4. */
export function normalizeIp(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || isIP(trimmed) === 0) {
    return undefined;
  }
  return ipaddr.process(trimmed).toString();
}
