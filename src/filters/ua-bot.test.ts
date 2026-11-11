import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isbot } from "isbot";
import { USER_AGENT_CACHE_SIZE, createUaBotFilter, isBotUserAgent } from "./ua-bot.ts";

const BROWSERS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
];

describe("isBotUserAgent", () => {
  test("passes regular browsers", () => {
    for (const userAgent of BROWSERS) {
      assert.equal(isBotUserAgent(userAgent), false, userAgent);
    }
  });

  test("detects bots on Matomo's list that isbot misses", () => {
    const userAgent = "Mozilla/5.0 (compatible; Blackbox Exporter)";
    assert.equal(isbot(userAgent), false);
    assert.equal(isBotUserAgent(userAgent), true);
  });
});

describe("createUaBotFilter", () => {
  const filter = createUaBotFilter((userAgent) => userAgent === "bot");
  const event = (userAgent: string | undefined) => ({ ip: "192.0.2.1", userAgent, acceptLanguage: "en", referrer: undefined, origin: undefined, hostname: undefined });

  test("drops bot user agents", () => {
    assert.equal(filter(event("bot")), "bot_user_agent");
  });

  test("passes other user agents, and leaves a missing one to the header check", () => {
    assert.equal(filter(event("browser")), undefined);
    assert.equal(filter(event(undefined)), undefined);
  });

  test("checks each user agent once", () => {
    const checked: string[] = [];
    const cachingFilter = createUaBotFilter((userAgent) => {
      checked.push(userAgent);
      return userAgent === "bot";
    });

    for (let i = 0; i < 3; i++) {
      assert.equal(cachingFilter(event("bot")), "bot_user_agent");
      assert.equal(cachingFilter(event("browser")), undefined);
    }
    assert.deepEqual(checked, ["bot", "browser"]);
  });

  test("forgets the oldest user agent when the cache is full", () => {
    const checked: string[] = [];
    const cachingFilter = createUaBotFilter((userAgent) => {
      checked.push(userAgent);
      return false;
    });

    for (let i = 0; i <= USER_AGENT_CACHE_SIZE; i++) {
      cachingFilter(event(`browser ${i}`));
    }
    cachingFilter(event("browser 0"));
    assert.equal(checked.length, USER_AGENT_CACHE_SIZE + 2);
  });
});
