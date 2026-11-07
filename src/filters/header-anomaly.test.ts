import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { headerAnomalyFilter } from "./header-anomaly.ts";

const event = (userAgent: string | undefined, acceptLanguage: string | undefined) => ({
  ip: "192.0.2.1",
  userAgent,
  acceptLanguage,
  referrer: undefined,
  origin: undefined,
  hostname: undefined,
});

describe("headerAnomalyFilter", () => {
  test("passes requests with a user agent and accepted languages", () => {
    assert.equal(headerAnomalyFilter(event("Mozilla/5.0", "en-US,en;q=0.9")), undefined);
  });

  test("drops requests without a user agent", () => {
    assert.equal(headerAnomalyFilter(event(undefined, "en")), "missing_user_agent");
    assert.equal(headerAnomalyFilter(event("", "en")), "missing_user_agent");
  });

  test("drops requests without accepted languages", () => {
    assert.equal(headerAnomalyFilter(event("Mozilla/5.0", undefined)), "missing_accept_language");
  });
});
