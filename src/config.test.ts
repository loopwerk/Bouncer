import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { parse } from "yaml";
import { loadConfig, parseConfig, resolveConfig } from "./config.ts";

describe("resolveConfig", () => {
  test("builds the whole config from environment variables", () => {
    const config = resolveConfig(undefined, {
      BOUNCER_UPSTREAM: "https://umami.example.com",
      BOUNCER_IP_HEADER: "CF-Connecting-IP",
      BOUNCER_FILTER_AUTOMATED_BROWSERS: "false",
      BOUNCER_FILTER_DATACENTER_IPS: "false",
      BOUNCER_FILTER_VPN_IPS: "TRUE",
      BOUNCER_FILTER_UA_BOT_DETECTION: "false",
      BOUNCER_FILTER_REFERRER_SPAM: "false",
      BOUNCER_FILTER_HEADER_ANOMALIES: "false",
      BOUNCER_FILTER_ORIGIN_MISMATCH: "false",
      BOUNCER_PORT: "8080",
      BOUNCER_HOST: "127.0.0.1",
      BOUNCER_LOG_LEVEL: "WARN",
    });
    assert.deepEqual(config, {
      upstream: "https://umami.example.com",
      ipHeader: "cf-connecting-ip",
      filters: {
        automatedBrowsers: false,
        datacenterIps: false,
        vpnIps: true,
        uaBotDetection: false,
        referrerSpam: false,
        headerAnomalies: false,
        originMismatch: false,
      },
      server: { port: 8080, host: "127.0.0.1" },
      logLevel: "warn",
    });
  });

  test("lets environment variables override the file, and keeps the rest of the file", () => {
    const file = { upstream: "https://file.example.com", ip_header: "x-real-ip", filters: { vpn_ips: true, referrer_spam: false } };
    const config = resolveConfig(file, { BOUNCER_UPSTREAM: "https://env.example.com", BOUNCER_FILTER_VPN_IPS: "false" });
    assert.equal(config.upstream, "https://env.example.com");
    assert.equal(config.ipHeader, "x-real-ip");
    assert.equal(config.filters.vpnIps, false);
    assert.equal(config.filters.referrerSpam, false);
  });

  test("ignores empty and unrelated environment variables", () => {
    const config = resolveConfig(
      { upstream: "https://umami.example.com" },
      { BOUNCER_UPSTREAM: "", BOUNCER_IP_HEADER: "", PATH: "/usr/bin" }
    );
    assert.equal(config.upstream, "https://umami.example.com");
    assert.equal(config.ipHeader, undefined);
  });

  test("names the environment variable in errors", () => {
    const upstream = { BOUNCER_UPSTREAM: "https://umami.example.com" };
    assert.throws(
      () => resolveConfig(undefined, { ...upstream, BOUNCER_FILTER_VPN_IPS: "yes" }),
      /BOUNCER_FILTER_VPN_IPS must be true or false/
    );
    assert.throws(() => resolveConfig(undefined, { ...upstream, BOUNCER_PORT: "3100abc" }), /BOUNCER_PORT must be a whole number/);
  });

  test("still requires an upstream", () => {
    assert.throws(() => resolveConfig(undefined, {}), /upstream must be a non-empty string/);
  });

  test("rejects a file that isn't a mapping", () => {
    assert.throws(() => resolveConfig("upstream", { BOUNCER_UPSTREAM: "https://umami.example.com" }), /config must be a mapping/);
  });
});

describe("loadConfig", () => {
  const dir = mkdtempSync(join(tmpdir(), "bouncer-config-"));
  const file = join(dir, "custom.yml");
  writeFileSync(file, "upstream: https://file.example.com\n");
  const missing = join(dir, "missing.yml");

  test("reads the file named by BOUNCER_CONFIG", () => {
    assert.equal(loadConfig({ BOUNCER_CONFIG: file }, missing).upstream, "https://file.example.com");
  });

  test("reads the default file when it exists", () => {
    assert.equal(loadConfig({}, file).upstream, "https://file.example.com");
  });

  test("works without a file when the environment has the settings", () => {
    assert.equal(loadConfig({ BOUNCER_UPSTREAM: "https://env.example.com" }, missing).upstream, "https://env.example.com");
  });

  test("fails when BOUNCER_CONFIG names a file that doesn't exist", () => {
    assert.throws(() => loadConfig({ BOUNCER_CONFIG: missing, BOUNCER_UPSTREAM: "https://env.example.com" }), /ENOENT/);
  });
});

describe("parseConfig", () => {
  test("fills in defaults when only upstream is set", () => {
    assert.deepEqual(parseConfig({ upstream: "https://umami.example.com" }), {
      upstream: "https://umami.example.com",
      ipHeader: undefined,
      filters: {
        automatedBrowsers: true,
        datacenterIps: true,
        vpnIps: false,
        uaBotDetection: true,
        referrerSpam: true,
        headerAnomalies: true,
        originMismatch: true,
      },
      server: { port: 3100, host: "0.0.0.0" },
      logLevel: "info",
    });
  });

  test("reads a full YAML config", () => {
    const yaml = `
upstream: https://umami.example.com/
ip_header: X-Client-Real-IP
filters:
  automated_browsers: false
  datacenter_ips: false
  vpn_ips: true
  ua_bot_detection: false
  referrer_spam: false
  header_anomalies: false
  origin_mismatch: false
server:
  port: 8080
  host: 127.0.0.1
log_level: error
`;
    assert.deepEqual(parseConfig(parse(yaml)), {
      upstream: "https://umami.example.com",
      ipHeader: "x-client-real-ip",
      filters: {
        automatedBrowsers: false,
        datacenterIps: false,
        vpnIps: true,
        uaBotDetection: false,
        referrerSpam: false,
        headerAnomalies: false,
        originMismatch: false,
      },
      server: { port: 8080, host: "127.0.0.1" },
      logLevel: "error",
    });
  });

  test("keeps defaults for filters that are left out", () => {
    const config = parseConfig({ upstream: "https://umami.example.com", filters: { vpn_ips: true } });
    assert.equal(config.filters.vpnIps, true);
    assert.equal(config.filters.datacenterIps, true);
  });

  test("treats an empty ip_header as not set", () => {
    assert.equal(parseConfig(parse("upstream: https://umami.example.com\nip_header:\n")).ipHeader, undefined);
  });

  test("keeps a path in the upstream URL", () => {
    assert.equal(parseConfig({ upstream: "https://example.com/umami/" }).upstream, "https://example.com/umami");
  });

  test("rejects a missing or invalid upstream", () => {
    assert.throws(() => parseConfig({}), /upstream must be a non-empty string/);
    assert.throws(() => parseConfig({ upstream: "umami.example.com" }), /upstream must be a URL/);
    assert.throws(() => parseConfig({ upstream: "ftp://umami.example.com" }), /http or https/);
  });

  test("rejects unknown settings, so typos are caught", () => {
    assert.throws(() => parseConfig({ upstream: "https://umami.example.com", ipheader: "x" }), /Unknown setting in config: ipheader/);
    assert.throws(
      () => parseConfig({ upstream: "https://umami.example.com", filters: { datacenter_ip: true } }),
      /Unknown setting in filters: datacenter_ip/
    );
  });

  test("rejects invalid values", () => {
    assert.throws(() => parseConfig("upstream"), /config must be a mapping/);
    assert.throws(() => parseConfig({ upstream: "https://umami.example.com", filters: { vpn_ips: "yes" } }), /filters.vpn_ips/);
    assert.throws(() => parseConfig({ upstream: "https://umami.example.com", server: { port: 70000 } }), /server.port/);
    assert.throws(() => parseConfig({ upstream: "https://umami.example.com", server: { port: "3100" } }), /server.port/);
    assert.throws(
      () => parseConfig({ upstream: "https://umami.example.com", log_level: "debug" }),
      /log_level must be info, warn or error/
    );
  });
});
