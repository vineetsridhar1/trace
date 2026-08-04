const MAX_EVENT_BYTES = 1024 * 1024;
const MAX_STRING_BYTES = 256 * 1024;
const MAX_ARRAY_ITEMS = 2_000;
const MAX_DEPTH = 24;

const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g;
const PROVIDER_TOKEN = /\b(?:sk[-_]|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{16,}\b/g;

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) {
    end = Math.floor(end * 0.9);
  }
  return `${value.slice(0, end)}\n[output truncated by Trace]`;
}

function redactString(value: string): string {
  return value
    .replace(BEARER_TOKEN, "Bearer [redacted]")
    .replace(JWT, "[redacted-jwt]")
    .replace(PROVIDER_TOKEN, "[redacted-token]");
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return [
    "authorization",
    "password",
    "secret",
    "credential",
    "apikey",
    "authtoken",
    "accesstoken",
    "refreshtoken",
    "clientsecret",
    "privatekey",
  ].some((suffix) => normalized.endsWith(suffix));
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return truncateUtf8(redactString(value), MAX_STRING_BYTES);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular value omitted]";
  if (depth >= MAX_DEPTH) return "[nested value omitted]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) items.push("[additional items omitted]");
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeValue(child, depth + 1, seen);
  }
  return result;
}

/** Sanitize untrusted coding-tool output before it enters the durable event log. */
export function sanitizeSessionOutput(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeValue(data, 0, new WeakSet()) as Record<string, unknown>;
  const bytes = Buffer.byteLength(JSON.stringify(sanitized), "utf8");
  if (bytes <= MAX_EVENT_BYTES) return sanitized;

  return {
    type: "error",
    message: `Agent output exceeded Trace's ${MAX_EVENT_BYTES}-byte event limit and was omitted.`,
    truncated: true,
    sanitizedBytes: bytes,
  };
}
