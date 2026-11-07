import type { FetchText, Store } from "../refresh.ts";
import type { Filter } from "./types.ts";

export const SPAM_LIST_URL = "https://raw.githubusercontent.com/matomo-org/referrer-spam-list/master/spammers.txt";

export async function downloadSpamDomains(fetchText: FetchText): Promise<Set<string>> {
  const domains = parseSpamDomains(await fetchText(SPAM_LIST_URL));
  if (domains.size === 0) {
    throw new Error("Downloaded referrer spam list has no entries");
  }
  return domains;
}

export function parseSpamDomains(text: string): Set<string> {
  const domains = new Set<string>();
  for (const line of text.split("\n")) {
    const domain = line.trim().toLowerCase();
    if (domain !== "" && !domain.startsWith("#")) {
      domains.add(domain);
    }
  }
  return domains;
}

/** True when the referrer's host is a listed domain or a subdomain of one. */
export function isSpamReferrer(referrer: string, domains: ReadonlySet<string>): boolean {
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }

  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (domains.has(labels.slice(i).join("."))) {
      return true;
    }
  }
  return false;
}

/** Passes everything until the list is downloaded. */
export function createReferrerSpamFilter(store: Store<ReadonlySet<string>>): Filter {
  return (event) => {
    const domains = store.current;
    return domains && event.referrer && isSpamReferrer(event.referrer, domains) ? "referrer_spam" : undefined;
  };
}
