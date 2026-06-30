export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (typeof process !== "undefined" &&
    (process.env.VITE_AURORA_LOG_LEVEL as LogLevel)) ||
  "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctx}`;
}

function createEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): LogEntry {
  return { level, message, context, timestamp: new Date().toISOString() };
}

export function createLogger(name: string) {
  const prefix = `[${name}]`;
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      logger.debug(`${prefix} ${message}`, context),
    info: (message: string, context?: Record<string, unknown>) =>
      logger.info(`${prefix} ${message}`, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      logger.warn(`${prefix} ${message}`, context),
    error: (message: string, context?: Record<string, unknown>) =>
      logger.error(`${prefix} ${message}`, context),
    log: (message: string, context?: Record<string, unknown>) =>
      logger.info(`${prefix} ${message}`, context),
    logError: (context: string, message: string) =>
      logger.error(`${prefix} [${context}] ${message}`),
  };
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    const entry = createEntry("debug", message, context);
    if (typeof console !== "undefined") console.debug(formatEntry(entry));
  },

  info(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    const entry = createEntry("info", message, context);
    if (typeof console !== "undefined") console.info(formatEntry(entry));
  },

  warn(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("warn")) return;
    const entry = createEntry("warn", message, context);
    if (typeof console !== "undefined") console.warn(formatEntry(entry));
  },

  error(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("error")) return;
    const entry = createEntry("error", message, context);
    if (typeof console !== "undefined") console.error(formatEntry(entry));
  },
};
