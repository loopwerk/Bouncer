import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { eventHostname, eventReferrer, forwardHeaders, parseEvent, withClientInfo } from "./umami.ts";

const BODY = {
  type: "event",
  payload: { website: "abc", hostname: "www.example.com", url: "/", referrer: "https://www.google.com/" },
};

describe("parseEvent", () => {
  test("accepts a tracker body", () => {
    assert.deepEqual(parseEvent(BODY), BODY);
  });

  test("rejects anything without a type and a payload object", () => {
    for (const body of [undefined, null, "event", [], {}, { type: "event" }, { type: 1, payload: {} }, { type: "event", payload: [] }]) {
      assert.equal(parseEvent(body), undefined, JSON.stringify(body));
    }
  });
});

describe("eventReferrer and eventHostname", () => {
  test("read string fields from the payload", () => {
    const event = parseEvent(BODY)!;
    assert.equal(eventReferrer(event), "https://www.google.com/");
    assert.equal(eventHostname(event), "www.example.com");
  });

  test("return undefined for missing, empty or non-string fields", () => {
    assert.equal(eventReferrer({ type: "event", payload: { referrer: "" } }), undefined);
    assert.equal(eventReferrer({ type: "event", payload: { referrer: 1 } }), undefined);
    assert.equal(eventHostname({ type: "event", payload: {} }), undefined);
  });
});

describe("withClientInfo", () => {
  test("overwrites any IP and user agent the client sent", () => {
    const event = { type: "event", payload: { ...BODY.payload, ip: "1.1.1.1", userAgent: "fake" } };
    assert.deepEqual(withClientInfo(event, "203.0.113.9", "Mozilla/5.0"), {
      type: "event",
      payload: { ...BODY.payload, ip: "203.0.113.9", userAgent: "Mozilla/5.0" },
    });
  });

  test("removes a client-sent user agent when the request has none", () => {
    const event = { type: "event", payload: { userAgent: "fake" } };
    assert.deepEqual(withClientInfo(event, "203.0.113.9", undefined).payload, { ip: "203.0.113.9" });
  });

  test("does not change the original event", () => {
    const event = { type: "event", payload: { userAgent: "fake" } };
    withClientInfo(event, "203.0.113.9", "Mozilla/5.0");
    assert.deepEqual(event, { type: "event", payload: { userAgent: "fake" } });
  });
});

describe("forwardHeaders", () => {
  test("keeps only the headers Umami needs", () => {
    const incoming = new Headers({
      "content-type": "text/plain",
      "user-agent": "Mozilla/5.0",
      "x-umami-cache": "token",
      "cf-connecting-ip": "203.0.113.9",
      "x-client-real-ip": "203.0.113.9",
      cookie: "a=b",
    });
    assert.deepEqual(Object.fromEntries(forwardHeaders(incoming)), {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      "x-umami-cache": "token",
    });
  });
});
