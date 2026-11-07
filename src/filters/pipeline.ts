import type { FilterConfig } from "../config.ts";
import type { Store } from "../refresh.ts";
import { createDatacenterFilter, type DatacenterLists } from "./datacenter-ip.ts";
import { headerAnomalyFilter } from "./header-anomaly.ts";
import { originMismatchFilter } from "./origin-mismatch.ts";
import { createReferrerSpamFilter } from "./referrer-spam.ts";
import type { DropReason, EventInfo, Filter } from "./types.ts";
import { createUaBotFilter } from "./ua-bot.ts";

export type FilterDeps = {
  datacenterLists: Store<DatacenterLists>;
  spamDomains: Store<ReadonlySet<string>>;
  isBotUserAgent: (userAgent: string) => boolean;
};

/** Builds the enabled filters, in the order they run. */
export function buildFilters(config: FilterConfig, deps: FilterDeps): Filter[] {
  const filters: Filter[] = [];
  if (config.uaBotDetection) {
    filters.push(createUaBotFilter(deps.isBotUserAgent));
  }
  if (config.datacenterIps || config.vpnIps) {
    filters.push(createDatacenterFilter(deps.datacenterLists, config));
  }
  if (config.referrerSpam) {
    filters.push(createReferrerSpamFilter(deps.spamDomains));
  }
  if (config.headerAnomalies) {
    filters.push(headerAnomalyFilter);
  }
  if (config.originMismatch) {
    filters.push(originMismatchFilter);
  }
  return filters;
}

/** Returns the reason from the first filter that drops the event, or undefined when all pass. */
export function runFilters(filters: Filter[], event: EventInfo): DropReason | undefined {
  for (const filter of filters) {
    const reason = filter(event);
    if (reason) {
      return reason;
    }
  }
  return undefined;
}
