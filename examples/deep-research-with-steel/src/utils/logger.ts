export const ENABLE_LOGS =
  process.env.DEBUG === "true" || process.env.LOG_LEVEL === "debug";

export const logger = {
  debug: (...args: unknown[]): void => {
    if (ENABLE_LOGS) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  },
  warn: (...args: unknown[]): void => {
    if (ENABLE_LOGS) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },
  error: (...args: unknown[]): void => {
    // Always surface errors
    // eslint-disable-next-line no-console
    console.error(...args);
  },
};
