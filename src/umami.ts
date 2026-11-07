export const SCRIPT_PATH = "/script.js";
export const EVENT_PATH = "/api/send";

/** The body Umami's tracker posts to `/api/send`. */
export type UmamiEvent = { type: string; payload: Record<string, unknown> };

export function parseEvent(body: unknown): UmamiEvent | undefined {
  if (!isPlainObject(body) || typeof body.type !== "string" || !isPlainObject(body.payload)) {
    return undefined;
  }
  return { ...body, type: body.type, payload: body.payload };
}

export function eventReferrer(event: UmamiEvent): string | undefined {
  const referrer = event.payload.referrer;
  return typeof referrer === "string" && referrer !== "" ? referrer : undefined;
}

export function eventHostname(event: UmamiEvent): string | undefined {
  const hostname = event.payload.hostname;
  return typeof hostname === "string" ? hostname : undefined;
}

/**
 * Sets the visitor IP and user agent in the payload. Umami prefers these over request headers,
 * so it records exactly what Bouncer filtered on, whatever its own `CLIENT_IP_HEADER` setting is.
 */
export function withClientInfo(event: UmamiEvent, ip: string, userAgent: string | undefined): UmamiEvent {
  const payload: Record<string, unknown> = { ...event.payload, ip };
  if (userAgent) {
    payload.userAgent = userAgent;
  } else {
    delete payload.userAgent;
  }
  return { ...event, payload };
}

/** The request headers Umami needs; everything else from the browser stays behind. */
export function forwardHeaders(incoming: Headers): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of ["user-agent", "x-umami-cache"]) {
    const value = incoming.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
