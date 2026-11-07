export const LOG_LEVELS = ["info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogEntry = { level: LogLevel; msg: string; [field: string]: unknown };

export type Log = (entry: LogEntry) => void;

/** Writes one JSON object per line, so log collectors can parse the fields. */
export const logToStdout: Log = (entry) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...entry }));
};

/** Passes entries at `minLevel` or above to `log`, and drops the rest. */
export function withMinLevel(minLevel: LogLevel, log: Log): Log {
  const min = LOG_LEVELS.indexOf(minLevel);
  return (entry) => {
    if (LOG_LEVELS.indexOf(entry.level) >= min) {
      log(entry);
    }
  };
}
