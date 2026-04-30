const SENSITIVE_KEY_PATTERNS = ["authorization", "secret", "token", "signature"];
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SIGNATURE_PATTERN = /v1=[0-9a-f]{32,}/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g;

export type AgentEnvironmentTelemetryData = Record<string, unknown>;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function redactString(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, "Bearer [redacted]")
    .replace(SIGNATURE_PATTERN, "v1=[redacted]")
    .replace(JWT_PATTERN, "[redacted]");
}

export function redactTelemetryData(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactTelemetryData);
  if (!value || typeof value !== "object") return value;

  const redacted: AgentEnvironmentTelemetryData = {};
  for (const [key, child] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key) ? "[redacted]" : redactTelemetryData(child);
  }
  return redacted;
}

function logTelemetry(level: "log" | "warn", event: string, data: AgentEnvironmentTelemetryData) {
  const payload = redactTelemetryData(data) as AgentEnvironmentTelemetryData;
  console[level](`[agent-environment] ${event}`, JSON.stringify(payload));
}

export function logAgentEnvironmentTelemetry(event: string, data: AgentEnvironmentTelemetryData) {
  logTelemetry("log", event, data);
}

export function alertAgentEnvironmentOperator(event: string, data: AgentEnvironmentTelemetryData) {
  logTelemetry("warn", event, data);
}
