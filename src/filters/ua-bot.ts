import { isbot } from "isbot";
import DeviceDetectorModule from "node-device-detector";
import type { Filter } from "./types.ts";

// The package is CommonJS (`module.exports = DeviceDetector`), but its type declarations use `export default`,
// so TypeScript thinks the default import is the module object instead of the class.
const DeviceDetector = DeviceDetectorModule as unknown as typeof DeviceDetectorModule.default;
const detector = new DeviceDetector();

/** Combines `isbot` (what Umami itself uses) with Matomo's device-detector bot list (what Plausible uses). */
export function isBotUserAgent(userAgent: string): boolean {
  return isbot(userAgent) || Boolean(detector.parseBot(userAgent).name);
}

export function createUaBotFilter(isBot: (userAgent: string) => boolean): Filter {
  return (event) => (event.userAgent && isBot(event.userAgent) ? "bot_user_agent" : undefined);
}
