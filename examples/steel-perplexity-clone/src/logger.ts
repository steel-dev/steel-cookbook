import { config } from "./config";

export const logLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;
export type LogLevel = (typeof logLevels)[number];

const levelPriority: Record<Exclude<LogLevel, "silent">, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

type ConsoleMethod = "error" | "warn" | "log";

export interface LogContext {
  // Optional correlation / request id
  requestId?: string;
  // Any extra fields you want to include
  [key: string]: unknown;
}

export interface LogRecord {
  time: string;
  level: LogLevel;
  msg: string;
  scope?: string | undefined;
  // If provided in context
  requestId?: string;
  // Optional error serialization
  err?: {
    name?: string;
    message?: string;
    stack?: string | undefined;
    cause?: unknown;
  };
  // Spread other context props
  [key: string]: unknown;
}

export interface Logger {
  fatal: (msg: string, context?: LogContext, err?: unknown) => void;
  error: (msg: string, context?: LogContext, err?: unknown) => void;
  warn: (msg: string, context?: LogContext) => void;
  info: (msg: string, context?: LogContext) => void;
  debug: (msg: string, context?: LogContext) => void;
  trace: (msg: string, context?: LogContext) => void;
  child: (scope: string, baseContext?: LogContext) => Logger;
  getLevel: () => LogLevel;
  setLevel: (level: LogLevel) => void;
}

// Mutable log level so it can be changed at runtime if needed
let currentLevel: LogLevel = config.server.logLevel;

function shouldLog(target: Exclude<LogLevel, "silent">): boolean {
  if (currentLevel === "silent") return false;
  // If currentLevel is 'silent' handled above, otherwise compare priorities
  const currentPriority =
    levelPriority[currentLevel as Exclude<LogLevel, "silent">] ?? 30;
  const targetPriority = levelPriority[target] ?? 30;
  return targetPriority >= currentPriority;
}

function consoleMethodFor(level: Exclude<LogLevel, "silent">): ConsoleMethod {
  if (level === "fatal" || level === "error") return "error";
  if (level === "warn") return "warn";
  return "log";
}

function serializeError(err: unknown): LogRecord["err"] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    const base: LogRecord["err"] = {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    };
    // Preserve cause where available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    if (anyErr.cause) base.cause = anyErr.cause;
    return base;
  }
  // Non-Error objects or primitives
  return {
    name: typeof err,
    message: String(err),
  };
}

function write(
  level: Exclude<LogLevel, "silent">,
  msg: string,
  scope?: string,
  context?: LogContext,
  err?: unknown,
) {
  if (!shouldLog(level)) return;

  const record: LogRecord = {
    time: new Date().toISOString(),
    level,
    msg,
    scope,
    ...context,
  };

  const serialized = serializeError(err);
  if (serialized) {
    record.err = serialized;
  }

  // Structured JSON log line
  const line = JSON.stringify(record);
  const method = consoleMethodFor(level);
  // Use the appropriate console channel
  // eslint-disable-next-line no-console
  console[method](line);
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export function createLogger(scope?: string, baseContext?: LogContext): Logger {
  const scoped =
    (level: Exclude<LogLevel, "silent">) =>
    (msg: string, context?: LogContext, err?: unknown) =>
      write(level, msg, scope, { ...baseContext, ...context }, err);

  const api: Logger = {
    fatal: scoped("fatal"),
    error: scoped("error"),
    warn: scoped("warn"),
    info: scoped("info"),
    debug: scoped("debug"),
    trace: scoped("trace"),
    child(childScope: string, childBase?: LogContext): Logger {
      const s = scope ? `${scope}:${childScope}` : childScope;
      return createLogger(s, { ...baseContext, ...childBase });
    },
    getLevel: getLogLevel,
    setLevel: setLogLevel,
  };

  return api;
}

// Default logger instance
const logger = createLogger();

export default logger;
