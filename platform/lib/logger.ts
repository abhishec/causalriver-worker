/**
 * Structured logger with level-based filtering.
 *
 * In development, defaults to `warn` — only warnings and errors show in the terminal.
 * In production, defaults to `info` — includes informational messages.
 *
 * Override via LOG_LEVEL env var:
 *   LOG_LEVEL=debug pnpm dev    # see everything
 *   LOG_LEVEL=error pnpm dev    # only errors
 *
 * Levels: debug < info < warn < error
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLevel(): number {
  const env = (process.env.LOG_LEVEL || "").toLowerCase() as LogLevel;
  if (env in LEVELS) return LEVELS[env];
  return process.env.NODE_ENV === "development" ? LEVELS.warn : LEVELS.info;
}

const currentLevel = getLevel();

function shouldLog(level: LogLevel): boolean {
  return currentLevel <= LEVELS[level];
}

export const logger = {
  /** Verbose detail — only visible with LOG_LEVEL=debug */
  debug: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    if (shouldLog("debug")) console.log(...args);
  },

  /** Normal operational messages — visible in production, hidden in dev by default */
  info: (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    if (shouldLog("info")) console.log(...args);
  },

  /** Something unexpected but recoverable — visible in dev */
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(...args);
  },

  /** Something broke — always visible */
  error: (...args: unknown[]) => {
    if (shouldLog("error")) console.error(...args);
  },
};
