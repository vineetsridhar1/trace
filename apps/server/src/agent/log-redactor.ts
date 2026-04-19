/**
 * Strip values that look like credentials from free-form text before it lands
 * in persisted LLM call logs. Conservative allowlist of well-known token
 * prefixes + obvious patterns; misses are acceptable because this is defense
 * in depth, not a substitute for never logging secrets.
 */

const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_\-]{20,}\b/g, // OpenAI / Anthropic style
  /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub personal access token
  /\bgho_[A-Za-z0-9]{20,}\b/g, // GitHub OAuth
  /\bghu_[A-Za-z0-9]{20,}\b/g,
  /\bghs_[A-Za-z0-9]{20,}\b/g,
  /\bghr_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, // JWT
];

const MAX_STRING_BYTES = 64 * 1024;

export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  if (out.length > MAX_STRING_BYTES) {
    out = out.slice(0, MAX_STRING_BYTES) + "…[truncated]";
  }
  return out;
}

export function redactDeep<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v)) as unknown as T;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = redactDeep(v);
    }
    return result as unknown as T;
  }
  return value;
}
