/**
 * Nexus Observability — Structured Logger
 *
 * Production-grade structured logging for the NexusBrain memory stack.
 * Uses a pino-compatible interface so you can swap in real pino in production.
 *
 * Features:
 * - Structured JSON output
 * - Log levels: trace, debug, info, warn, error, fatal
 * - Child loggers with inherited context
 * - Performance timing helpers
 * - Redaction of sensitive fields
 * - Zero external dependencies (pino-compatible interface)
 */

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 100,
};

export interface LoggerConfig {
  /** Minimum log level to emit */
  level?: LogLevel;
  /** Service name for log context */
  name?: string;
  /** Default fields added to every log entry */
  base?: Record<string, unknown>;
  /** Fields to redact from log output */
  redact?: string[];
  /** Custom output destination (defaults to console) */
  destination?: LogDestination;
  /** Whether to pretty-print (dev mode) or output JSON (production) */
  prettyPrint?: boolean;
  /** Enable performance timing */
  enableTimers?: boolean;
}

export interface LogDestination {
  write(entry: LogEntry): void;
}

export interface LogEntry {
  level: LogLevel;
  levelValue: number;
  time: string;
  msg: string;
  name?: string;
  [key: string]: unknown;
}

export interface NexusLogger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;

  /** Create a child logger with additional context */
  child(bindings: Record<string, unknown>): NexusLogger;

  /** Start a performance timer */
  startTimer(label: string): () => number;

  /** Set minimum log level */
  setLevel(level: LogLevel): void;

  /** Get current level */
  getLevel(): LogLevel;

  /** Check if a level would be logged */
  isLevelEnabled(level: LogLevel): boolean;
}

// ============================================================================
// LOGGER IMPLEMENTATION
// ============================================================================

const SENSITIVE_FIELDS = [
  'password', 'token', 'apiKey', 'api_key', 'secret',
  'authorization', 'cookie', 'session', 'credential',
  'embeddingApiKey', 'aiApiKey', 'supabaseKey',
];

function redactValue(key: string, value: unknown, redactList: string[]): unknown {
  const lowerKey = key.toLowerCase();
  for (const field of redactList) {
    if (lowerKey.includes(field.toLowerCase())) {
      return '[REDACTED]';
    }
  }
  return value;
}

function redactObject(
  obj: Record<string, unknown>,
  redactList: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, redactList);
    } else {
      result[key] = redactValue(key, value, redactList);
    }
  }
  return result;
}

/**
 * Create a structured logger instance.
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   level: 'info',
 *   name: 'nexusbrain',
 *   base: { organizationId: 'org_123' },
 * });
 *
 * logger.info('Signal ingested', { domain: 'engineering', count: 5 });
 * // => {"level":"info","time":"...","name":"nexusbrain","msg":"Signal ingested","domain":"engineering","count":5,"organizationId":"org_123"}
 *
 * const childLogger = logger.child({ layer: 'L4-causal' });
 * childLogger.info('Discovery started');
 * // => {"level":"info","time":"...","name":"nexusbrain","msg":"Discovery started","organizationId":"org_123","layer":"L4-causal"}
 * ```
 */
export function createLogger(config: LoggerConfig = {}): NexusLogger {
  const {
    name,
    base = {},
    redact = SENSITIVE_FIELDS,
    destination,
    prettyPrint = false,
  } = config;

  let currentLevel: LogLevel = config.level || 'info';
  let currentLevelValue = LOG_LEVEL_VALUES[currentLevel];

  function emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    const levelValue = LOG_LEVEL_VALUES[level];
    if (levelValue < currentLevelValue) return;

    const entry: LogEntry = {
      level,
      levelValue,
      time: new Date().toISOString(),
      msg,
      ...(name ? { name } : {}),
      ...redactObject(base, redact),
      ...(data ? redactObject(data, redact) : {}),
    };

    if (destination) {
      destination.write(entry);
    } else if (prettyPrint) {
      const color = level === 'error' || level === 'fatal' ? '\x1b[31m'
        : level === 'warn' ? '\x1b[33m'
        : level === 'info' ? '\x1b[36m'
        : level === 'debug' ? '\x1b[90m'
        : '\x1b[37m';
      const reset = '\x1b[0m';
      const { level: _l, levelValue: _lv, time, msg: _m, name: _n, ...rest } = entry;
      const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
      console.log(`${color}[${time}] ${level.toUpperCase().padEnd(5)} ${name ? `(${name}) ` : ''}${msg}${extra}${reset}`);
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  const logger: NexusLogger = {
    trace: (msg, data) => emit('trace', msg, data),
    debug: (msg, data) => emit('debug', msg, data),
    info: (msg, data) => emit('info', msg, data),
    warn: (msg, data) => emit('warn', msg, data),
    error: (msg, data) => emit('error', msg, data),
    fatal: (msg, data) => emit('fatal', msg, data),

    child(bindings: Record<string, unknown>): NexusLogger {
      return createLogger({
        level: currentLevel,
        name,
        base: { ...base, ...bindings },
        redact,
        destination,
        prettyPrint,
      });
    },

    startTimer(label: string): () => number {
      const start = performance.now();
      return () => {
        const elapsed = performance.now() - start;
        emit('debug', `${label} completed`, { durationMs: Math.round(elapsed * 100) / 100 });
        return elapsed;
      };
    },

    setLevel(level: LogLevel): void {
      currentLevel = level;
      currentLevelValue = LOG_LEVEL_VALUES[level];
    },

    getLevel(): LogLevel {
      return currentLevel;
    },

    isLevelEnabled(level: LogLevel): boolean {
      return LOG_LEVEL_VALUES[level] >= currentLevelValue;
    },
  };

  return logger;
}

// ============================================================================
// SINGLETON (default logger)
// ============================================================================

let _defaultLogger: NexusLogger | null = null;

/**
 * Get or create the default logger singleton.
 * Configure once at application startup.
 */
export function getDefaultLogger(config?: LoggerConfig): NexusLogger {
  if (!_defaultLogger || config) {
    _defaultLogger = createLogger({
      name: 'nexusbrain',
      level: (process?.env?.NEXUS_LOG_LEVEL as LogLevel) || 'info',
      prettyPrint: process?.env?.NODE_ENV !== 'production',
      ...config,
    });
  }
  return _defaultLogger;
}
