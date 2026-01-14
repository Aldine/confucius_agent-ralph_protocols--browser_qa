import crypto from "node:crypto";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

const SECRET_KEY_RE = /(api[-_]?key|token|secret|password|authorization|cookie|session)/i;

function redact(value: unknown, depth = 0): Json {
  if (depth > 6) return "[truncated]";
  if (value == null) return null;

  if (typeof value === "string") {
    return value.length > 500 ? value.slice(0, 500) + "..." : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));

  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }

  return String(value);
}

function writeLine(line: string) {
  process.stderr.write(line + "\n");
}

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(opts?: { name?: string; level?: "debug" | "info" | "warn" | "error" }) {
  const name = opts?.name ?? "confucius-mcp-browser";
  const min = (opts?.level ?? (process.env.LOG_LEVEL as any) ?? "info") as keyof typeof order;
  const order = { debug: 10, info: 20, warn: 30, error: 40 } as const;

  function emit(level: keyof typeof order, event: string, fields?: Record<string, unknown>) {
    if (order[level] < order[min]) return;
    const timestamp = new Date().toISOString();
    const redacted = redact(fields ?? {}) as Record<string, unknown>;
    const line = JSON.stringify({
      timestamp,
      level,
      name,
      event,
      ...redacted,
    });
    writeLine(line);
  }

  function newTraceId() {
    return crypto.randomBytes(8).toString("hex");
  }

  return {
    debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
    info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
    error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
    newTraceId,
  };
}
