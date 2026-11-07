import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isbot } from "isbot";
import { createUaBotFilter, isBotUserAgent } from "./ua-bot.ts";

const BROWSERS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
];

const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
  "curl/8.7.1",
  "python-requests/2.32.3",
];

describe("isBotUserAgent", () => {
  test("passes regular browsers", () => {
    for (const userAgent of BROWSERS) {
      assert.equal(isBotUserAgent(userAgent), false, userAgent);
    }
  });

  test("detects crawlers, headless browsers and HTTP libraries", () => {
    for (const userAgent of BOTS) {
      assert.equal(isBotUserAgent(userAgent), true, userAgent);
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
});
