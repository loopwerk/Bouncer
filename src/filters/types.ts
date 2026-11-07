export type DropReason = "bot_user_agent" |
  "datacenter_ip" |
  "vpn_ip" |
  "referrer_spam" |
  "missing_user_agent" |
  "missing_accept_language" |
  "missing_origin" |
  "origin_mismatch";

/** What the filters get to see of an incoming event. */
export type EventInfo = {
  ip: string;
  userAgent: string | undefined;
  acceptLanguage: string | undefined;
  referrer: string | undefined;
  origin: string | undefined;
  hostname: string | undefined;
};

/** Returns a reason when the event should be dropped, undefined when it passes. */
export type Filter = (event: EventInfo) => DropReason | undefined;
