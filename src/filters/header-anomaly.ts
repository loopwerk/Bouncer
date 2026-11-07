import type { Filter } from "./types.ts";

/** Browsers always send these headers with the tracker's request; simple HTTP clients often don't. */
export const headerAnomalyFilter: Filter = (event) => {
  if (!event.userAgent) {
    return "missing_user_agent";
  }
  if (!event.acceptLanguage) {
    return "missing_accept_language";
  }
  return undefined;
};
