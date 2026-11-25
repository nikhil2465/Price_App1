/**
 * Minimal structured JSON logger (one line per event) so logs are queryable in
 * any aggregator without adding a dependency. Never pass secrets or raw user
 * messages as fields; log ids, sizes and outcomes instead.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel, base: Record<string, unknown> = {}): Logger {
  const min = ORDER[level];
  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < min) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...base, ...fields });
    (lvl === "error" || lvl === "warn" ? process.stderr : process.stdout).write(line + "\n");
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => createLogger(level, { ...base, ...fields }),
  };
}

/** Serialises an unknown error for logs without leaking request bodies. */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    return { err_name: err.name, err_message: err.message, ...(typeof status === "number" ? { err_status: status } : {}) };
  }
  return { err_message: String(err) };
}
