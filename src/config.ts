import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { LOG_LEVELS, type LogLevel } from "./logging.ts";

export type FilterConfig = {
  automatedBrowsers: boolean;
  datacenterIps: boolean;
  vpnIps: boolean;
  uaBotDetection: boolean;
  referrerSpam: boolean;
  headerAnomalies: boolean;
  originMismatch: boolean;
};

export type Config = {
  upstream: string;
  ipHeader: string | undefined;
  filters: FilterConfig;
  server: { port: number; host: string };
  logLevel: LogLevel;
};

const FILTER_KEYS: Record<string, keyof FilterConfig> = {
  automated_browsers: "automatedBrowsers",
  datacenter_ips: "datacenterIps",
  vpn_ips: "vpnIps",
  ua_bot_detection: "uaBotDetection",
  referrer_spam: "referrerSpam",
  header_anomalies: "headerAnomalies",
  origin_mismatch: "originMismatch",
};

const DEFAULT_FILTERS: FilterConfig = {
  automatedBrowsers: true,
  datacenterIps: true,
  vpnIps: false,
  uaBotDetection: true,
  referrerSpam: true,
  headerAnomalies: true,
  originMismatch: true,
};

const DEFAULT_SERVER = { port: 3100, host: "0.0.0.0" };

const DEFAULT_CONFIG_PATH = "bouncer.config.yml";

type Env = Record<string, string | undefined>;

/** Environment variables and the config file setting each one overrides. */
const ENV_SETTINGS: { name: string; path: [string] | [string, string]; type: "string" | "boolean" | "number" }[] = [
  { name: "BOUNCER_UPSTREAM", path: ["upstream"], type: "string" },
  { name: "BOUNCER_IP_HEADER", path: ["ip_header"], type: "string" },
  { name: "BOUNCER_FILTER_AUTOMATED_BROWSERS", path: ["filters", "automated_browsers"], type: "boolean" },
  { name: "BOUNCER_FILTER_DATACENTER_IPS", path: ["filters", "datacenter_ips"], type: "boolean" },
  { name: "BOUNCER_FILTER_VPN_IPS", path: ["filters", "vpn_ips"], type: "boolean" },
  { name: "BOUNCER_FILTER_UA_BOT_DETECTION", path: ["filters", "ua_bot_detection"], type: "boolean" },
  { name: "BOUNCER_FILTER_REFERRER_SPAM", path: ["filters", "referrer_spam"], type: "boolean" },
  { name: "BOUNCER_FILTER_HEADER_ANOMALIES", path: ["filters", "header_anomalies"], type: "boolean" },
  { name: "BOUNCER_FILTER_ORIGIN_MISMATCH", path: ["filters", "origin_mismatch"], type: "boolean" },
  { name: "BOUNCER_PORT", path: ["server", "port"], type: "number" },
  { name: "BOUNCER_HOST", path: ["server", "host"], type: "string" },
  { name: "BOUNCER_LOG_LEVEL", path: ["log_level"], type: "string" },
];

/**
 * Reads the config file named by `BOUNCER_CONFIG`, or `defaultPath` when it exists, and applies environment variables on top.
 * Without a file, the environment variables alone make up the config.
 */
export function loadConfig(env: Env, defaultPath = DEFAULT_CONFIG_PATH): Config {
  const path = env.BOUNCER_CONFIG || (existsSync(defaultPath) ? defaultPath : undefined);
  const fileContent: unknown = path ? parse(readFileSync(path, "utf8")) : undefined;
  return resolveConfig(fileContent, env);
}

/** Combines a parsed config file (undefined or null when there is none) with environment variables, which take precedence. */
export function resolveConfig(fileContent: unknown, env: Env): Config {
  const file = isUnset(fileContent) ? {} : asObject(fileContent, "config");
  const merged: Record<string, unknown> = { ...file };

  for (const setting of ENV_SETTINGS) {
    const value = env[setting.name];
    if (value === undefined || value === "") {
      continue;
    }

    const [section, key] = setting.path;
    if (key === undefined) {
      merged[section] = envValue(setting.name, value, setting.type);
    } else {
      const current = merged[section];
      merged[section] = { ...(isMapping(current) ? current : {}), [key]: envValue(setting.name, value, setting.type) };
    }
  }

  return parseConfig(merged);
}

function envValue(name: string, value: string, type: "string" | "boolean" | "number"): string | boolean | number {
  if (type === "boolean") {
    const lower = value.trim().toLowerCase();
    if (lower !== "true" && lower !== "false") {
      throw new Error(`${name} must be true or false`);
    }
    return lower === "true";
  }

  if (type === "number") {
    if (!/^\d+$/.test(value.trim())) {
      throw new Error(`${name} must be a whole number`);
    }
    return Number(value);
  }

  return value;
}

export function parseConfig(raw: unknown): Config {
  const root = asObject(raw, "config");
  checkKeys(root, ["upstream", "ip_header", "filters", "server", "log_level"], "config");

  return {
    upstream: parseUpstream(root.upstream),
    ipHeader: isUnset(root.ip_header) ? undefined : asNonEmptyString(root.ip_header, "ip_header").toLowerCase(),
    filters: parseFilters(root.filters),
    server: parseServer(root.server),
    logLevel: parseLogLevel(root.log_level),
  };
}

function parseUpstream(value: unknown): string {
  const text = asNonEmptyString(value, "upstream");
  let url: URL;

  try {
    url = new URL(text);
  } catch {
    throw new Error(`upstream must be a URL, got "${text}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`upstream must be an http or https URL, got "${text}"`);
  }

  return text.replace(/\/+$/, "");
}

function parseFilters(value: unknown): FilterConfig {
  if (isUnset(value)) {
    return { ...DEFAULT_FILTERS };
  }

  const section = asObject(value, "filters");
  checkKeys(section, Object.keys(FILTER_KEYS), "filters");

  const filters = { ...DEFAULT_FILTERS };

  for (const [key, field] of Object.entries(FILTER_KEYS)) {
    const setting = section[key];
    if (isUnset(setting)) {
      continue;
    }

    if (typeof setting !== "boolean") {
      throw new Error(`filters.${key} must be true or false`);
    }

    filters[field] = setting;
  }

  return filters;
}

function parseServer(value: unknown): Config["server"] {
  if (isUnset(value)) {
    return { ...DEFAULT_SERVER };
  }

  const section = asObject(value, "server");
  checkKeys(section, ["port", "host"], "server");

  const port = isUnset(section.port) ? DEFAULT_SERVER.port : section.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("server.port must be a whole number between 1 and 65535");
  }

  const host = isUnset(section.host) ? DEFAULT_SERVER.host : asNonEmptyString(section.host, "server.host");
  return { port, host };
}

function parseLogLevel(value: unknown): LogLevel {
  if (isUnset(value)) {
    return "info";
  }

  const level = LOG_LEVELS.find((level) => typeof value === "string" && level === value.trim().toLowerCase());
  if (!level) {
    throw new Error("log_level must be info, warn or error");
  }

  return level;
}

function isUnset(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (!isMapping(value)) {
    throw new Error(`${name} must be a mapping`);
  }

  return value;
}

function asNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function checkKeys(section: Record<string, unknown>, allowed: string[], name: string): void {
  const unknown = Object.keys(section).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown setting in ${name}: ${unknown.join(", ")}`);
  }
}
