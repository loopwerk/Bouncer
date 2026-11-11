import { isbot } from "isbot";
import DeviceDetectorModule from "node-device-detector";
import type { Filter } from "./types.ts";

// The package is CommonJS (`module.exports = DeviceDetector`), but its type declarations use `export default`,
// so TypeScript thinks the default import is the module object instead of the class.
const DeviceDetector = DeviceDetectorModule as unknown as typeof DeviceDetectorModule.default;
const detector = new DeviceDetector();

/** The limit stops bots that send random user agents from growing memory without end. */
export const USER_AGENT_CACHE_SIZE = 1000;

/** Combines `isbot` (what Umami itself uses) with Matomo's device-detector bot list (what Plausible uses). */
export function isBotUserAgent(userAgent: string): boolean {
  return isbot(userAgent) || Boolean(detector.parseBot(userAgent).name);
}

/** Remembers the result for recent user agents: `isBotUserAgent` is slow, and visitors' user agents repeat a lot. */
export function createUaBotFilter(isBot: (userAgent: string) => boolean): Filter {
  const cache = new Map<string, boolean>();

  const isCachedBot = (userAgent: string) => {
    let result = cache.get(userAgent);
    if (result === undefined) {
      result = isBot(userAgent);
      if (cache.size >= USER_AGENT_CACHE_SIZE) {
        // A Map keeps insertion order, so the first key is the oldest.
        cache.delete(cache.keys().next().value!);
      }
      cache.set(userAgent, result);
    }
    return result;
  };

  return (event) => (event.userAgent && isCachedBot(event.userAgent) ? "bot_user_agent" : undefined);
}
