import type { Filter } from "./types.ts";

/** Browsers send the page's origin with the tracker's request; scripts that post events straight to Bouncer often don't. */
export const originMismatchFilter: Filter = (event) => {
  if (!event.origin) {
    return "missing_origin";
  }

  let host: string;
  try {
    host = new URL(event.origin).hostname;
  } catch {
    return "origin_mismatch";
  }
  return host === event.hostname ? undefined : "origin_mismatch";
};
