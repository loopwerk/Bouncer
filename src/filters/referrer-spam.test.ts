import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SPAM_LIST_URL, createReferrerSpamFilter, downloadSpamDomains, isSpamReferrer, parseSpamDomains } from "./referrer-spam.ts";

const DOMAINS = parseSpamDomains("# comment\nspam.example\n\n  Shouting.EXAMPLE  \nsub.listed.example\n");

describe("parseSpamDomains", () => {
  test("reads one lowercase domain per line, skipping blanks and comments", () => {
    assert.deepEqual([...DOMAINS], ["spam.example", "shouting.example", "sub.listed.example"]);
  });
});

describe("downloadSpamDomains", () => {
  test("downloads and parses Matomo's list", async () => {
    let requested: string | undefined;
    const domains = await downloadSpamDomains(async (url) => {
      requested = url;
      return "spam.example\nother.example\n";
    });
    assert.equal(requested, SPAM_LIST_URL);
    assert.deepEqual([...domains], ["spam.example", "other.example"]);
  });

  test("fails when the list has no entries", async () => {
    await assert.rejects(
      downloadSpamDomains(async () => "\n"),
      /no entries/
    );
  });
});

describe("isSpamReferrer", () => {
  test("matches a listed domain and its subdomains", () => {
    assert.equal(isSpamReferrer("https://spam.example/page", DOMAINS), true);
    assert.equal(isSpamReferrer("http://www.spam.example", DOMAINS), true);
    assert.equal(isSpamReferrer("https://a.b.shouting.example/", DOMAINS), true);
  });

  test("ignores case and a trailing dot in the host", () => {
    assert.equal(isSpamReferrer("https://SPAM.Example./", DOMAINS), true);
  });

  test("does not match parents of a listed subdomain", () => {
    assert.equal(isSpamReferrer("https://listed.example/", DOMAINS), false);
    assert.equal(isSpamReferrer("https://sub.listed.example/", DOMAINS), true);
  });

  test("does not match domains that only share a suffix", () => {
    assert.equal(isSpamReferrer("https://notspam.example/", DOMAINS), false);
  });

  test("passes referrers that are not absolute URLs", () => {
    assert.equal(isSpamReferrer("/some/path", DOMAINS), false);
    assert.equal(isSpamReferrer("spam.example", DOMAINS), false);
  });
});

describe("createReferrerSpamFilter", () => {
  const event = (referrer: string | undefined) => ({ ip: "192.0.2.1", userAgent: "Mozilla/5.0", acceptLanguage: "en", referrer, origin: undefined, hostname: undefined });

  test("drops spam referrers and passes others", () => {
    const filter = createReferrerSpamFilter({ current: DOMAINS });
    assert.equal(filter(event("https://spam.example/")), "referrer_spam");
    assert.equal(filter(event("https://www.google.com/")), undefined);
    assert.equal(filter(event(undefined)), undefined);
  });

  test("passes everything until the list is loaded", () => {
    const filter = createReferrerSpamFilter({ current: undefined });
    assert.equal(filter(event("https://spam.example/")), undefined);
  });
});
