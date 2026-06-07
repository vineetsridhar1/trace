import { randomBytes } from "crypto";
import type { EndpointTrafficCaptureMode } from "@prisma/client";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function endpointPreviewBaseHost(): string {
  return process.env.TRACE_ENDPOINT_PREVIEW_BASE_HOST?.trim() || "preview.localhost";
}

export function endpointPreviewScheme(): string {
  return process.env.TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME?.trim() || "http";
}

export function endpointProxyRequestTimeoutMs(): number {
  const parsed = Number(process.env.TRACE_ENDPOINT_PROXY_REQUEST_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 60_000;
}

export function endpointTrafficRetentionHours(): number {
  const parsed = Number(process.env.TRACE_ENDPOINT_TRAFFIC_RETENTION_HOURS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 24;
}

export function endpointTrafficMaxBodyBytes(): number {
  const parsed = Number(process.env.TRACE_ENDPOINT_TRAFFIC_MAX_BODY_BYTES);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 65_536;
}

export function buildEndpointUrl(key: string): string {
  return `${endpointPreviewScheme()}://${key}.${endpointPreviewBaseHost()}`;
}

export function generateEndpointKey(length = 12): string {
  const bytes = randomBytes(length);
  let key = "";
  for (const byte of bytes) {
    key += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
  }
  return key;
}

export function extractEndpointKey(hostHeader: string | undefined | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0]?.toLowerCase();
  const baseHost = endpointPreviewBaseHost().toLowerCase();
  if (!host || host === baseHost || !host.endsWith(`.${baseHost}`)) return null;
  const key = host.slice(0, -1 * (`.${baseHost}`).length).split(".").at(-1);
  return key && /^[a-z0-9-]+$/.test(key) ? key : null;
}

export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const sanitized: Record<string, string | string[]> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    if (value == null) continue;
    const name = rawName.toLowerCase();
    if (
      name === "authorization" ||
      name === "cookie" ||
      name === "set-cookie" ||
      name === "x-api-key" ||
      name === "x-auth-token" ||
      name.includes("token") ||
      name.includes("secret") ||
      name.includes("key")
    ) {
      sanitized[rawName] = "[redacted]";
      continue;
    }
    sanitized[rawName] = value;
  }
  return sanitized;
}

export function shouldCaptureHeaders(mode: EndpointTrafficCaptureMode): boolean {
  return mode === "headers" || mode === "full";
}

export function shouldCaptureBodies(mode: EndpointTrafficCaptureMode): boolean {
  return mode === "full";
}

export function bodyPreview(buffer: Buffer, maxBytes = endpointTrafficMaxBodyBytes()) {
  const truncated = buffer.byteLength > maxBytes;
  const preview = buffer.subarray(0, maxBytes);
  return {
    preview: preview.toString("utf8"),
    bytes: buffer.byteLength,
    truncated,
  };
}
