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

export function endpointProxyMaxRequestBodyBytes(): number {
  const parsed = Number(process.env.TRACE_ENDPOINT_PROXY_MAX_REQUEST_BODY_BYTES);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
}

export function endpointProxyMaxResponseBodyBytes(): number {
  const parsed = Number(process.env.TRACE_ENDPOINT_PROXY_MAX_RESPONSE_BODY_BYTES);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
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
  const baseHost = endpointPreviewBaseHost().toLowerCase().split(":")[0];
  if (!host || host === baseHost || !host.endsWith(`.${baseHost}`)) return null;
  // The key must be exactly one label: `<key>.<baseHost>`. Reject deeper
  // subdomains (`evil.<key>.<baseHost>`) so one endpoint isn't reachable from
  // unbounded origins that could script/set cookies across the isolation seam.
  const prefix = host.slice(0, -1 * (`.${baseHost}`).length);
  return /^[a-z0-9-]+$/.test(prefix) ? prefix : null;
}

// Origins Trace itself serves from — the legitimate embedder of a preview iframe.
// Read lazily so tests and deployments can vary the env without reload ordering.
function traceAppOrigins(): Set<string> {
  const origins = new Set<string>();
  const add = (raw: string | undefined) => {
    const trimmed = raw?.trim();
    if (trimmed) origins.add(trimmed);
  };
  add(process.env.TRACE_WEB_URL);
  for (const value of (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")) add(value);
  return origins;
}

/**
 * Decide whether a credentialed request/upgrade to a preview endpoint may
 * proceed based on its browser Origin. Requests carry the preview cookie
 * (SameSite=None) so they ride any cross-site context; we only allow:
 *  - no Origin (top-level navigation — not a cross-site credentialed fetch),
 *  - the endpoint's own preview origin (the app's own same-origin subrequests),
 *  - a Trace app origin (the legitimate iframe embedder).
 * Everything else is a cross-site request and is rejected (CSWSH/CSRF guard).
 */
export function isAllowedPreviewRequestOrigin(
  originHeader: string | string[] | undefined,
  endpointKey: string,
): boolean {
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!origin) return true;
  // The app's own same-origin subrequests carry the endpoint's origin. Compare
  // by endpoint key (not exact string) so a local/proxied port or scheme
  // difference doesn't reject the app's legitimate own traffic.
  try {
    if (extractEndpointKey(new URL(origin).host) === endpointKey) return true;
  } catch {
    // Non-URL Origin (e.g. "null") — fall through to the Trace allowlist.
  }
  return traceAppOrigins().has(origin);
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

const TRACE_SESSION_COOKIE = "trace_token";

// Hop-by-hop headers (RFC 7230 §6.1) must not be relayed across a proxy hop.
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// WebSocket handshake headers are regenerated by the runtime's outbound client.
const WS_HANDSHAKE_HEADERS = new Set([
  "host",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-accept",
  "sec-websocket-protocol",
]);

// Trace credentials live in the session cookie plus __trace_-prefixed cookies
// (e.g. the endpoint preview cookie). Strip those pairs so the proxied
// application keeps its own cookies but never receives Trace credentials.
function stripTraceSessionCookie(value: string): string | null {
  const kept = value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const name = part.split("=")[0]?.trim().toLowerCase() ?? "";
      return name !== TRACE_SESSION_COOKIE && !name.startsWith("__trace_");
    });
  return kept.length ? kept.join("; ") : null;
}

// Build the header set forwarded to the runtime-hosted application. Trace
// credentials and hop-by-hop headers are removed so untrusted app code can never
// observe the caller's Trace session.
export function forwardableRequestHeaders(
  headers: Record<string, string | string[] | undefined>,
  options?: { websocket?: boolean; disableCache?: boolean },
): Record<string, string | string[]> {
  const forwarded: Record<string, string | string[]> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    if (value == null) continue;
    const name = rawName.toLowerCase();
    if (name === "authorization" || name === "proxy-authorization") continue;
    if (HOP_BY_HOP_HEADERS.has(name)) continue;
    if (options?.websocket && WS_HANDSHAKE_HEADERS.has(name)) continue;
    if (
      options?.disableCache &&
      (name === "cache-control" ||
        name === "pragma" ||
        name === "if-none-match" ||
        name === "if-modified-since")
    ) {
      continue;
    }
    if (name === "cookie") {
      const cookie = Array.isArray(value) ? value.join("; ") : value;
      const stripped = stripTraceSessionCookie(cookie);
      if (stripped) forwarded[rawName] = stripped;
      continue;
    }
    forwarded[rawName] = value;
  }
  if (options?.disableCache) {
    forwarded["cache-control"] = "no-cache";
    forwarded.pragma = "no-cache";
  }
  return forwarded;
}

export function webSocketProtocols(
  headers: Record<string, string | string[] | undefined>,
): string[] {
  const value = headers["sec-websocket-protocol"];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values
        .flatMap((entry) => entry.split(","))
        .map((protocol) => protocol.trim())
        .filter(Boolean),
    ),
  ];
}

// Remove the `Domain` attribute from a Set-Cookie so the app's cookie stays
// host-only. Endpoints are siblings under one base host; a `Domain=<baseHost>`
// cookie from one untrusted app would otherwise be sent to every other
// endpoint (cross-tenant cookie tossing / fixation).
function stripSetCookieDomain(setCookie: string): string {
  return setCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.toLowerCase().startsWith("domain="))
    .join("; ");
}

// Strip hop-by-hop headers from the application's response before relaying it
// back to the caller; the proxy manages framing itself. Set-Cookie is forwarded
// but forced host-only so untrusted apps can't inject cookies onto siblings.
export function forwardableResponseHeaders(
  headers: Record<string, string | string[]>,
  options?: { disableCache?: boolean },
): Record<string, string | string[]> {
  const forwarded: Record<string, string | string[]> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(name)) continue;
    if (
      options?.disableCache &&
      (name === "age" ||
        name === "cache-control" ||
        name === "etag" ||
        name === "expires" ||
        name === "last-modified")
    ) {
      continue;
    }
    if (name === "set-cookie") {
      forwarded[rawName] = Array.isArray(value)
        ? value.map(stripSetCookieDomain)
        : stripSetCookieDomain(value);
      continue;
    }
    forwarded[rawName] = value;
  }
  if (options?.disableCache) forwarded["Cache-Control"] = "no-store";
  return forwarded;
}

// Warn at startup when previews are not served from a registrable domain distinct
// from the Trace app origin (the plan's "never render untrusted content from the
// Trace app origin"). A shared parent domain can let untrusted app JS reach
// Trace's cookies/DOM despite the iframe sandbox.
export function warnIfPreviewHostNotIsolated(traceWebUrl: string | undefined): void {
  const baseHost = endpointPreviewBaseHost().toLowerCase().split(":")[0];
  const appHost = (() => {
    try {
      return traceWebUrl ? new URL(traceWebUrl).hostname.toLowerCase() : null;
    } catch {
      return null;
    }
  })();
  if (!appHost) return;
  const registrable = (host: string) => host.split(".").slice(-2).join(".");
  const shared =
    appHost === baseHost ||
    appHost.endsWith(`.${baseHost}`) ||
    baseHost.endsWith(`.${appHost}`) ||
    registrable(appHost) === registrable(baseHost);
  if (!shared) return;
  const message =
    `[endpoint-preview] preview base host "${baseHost}" shares a registrable domain with the Trace app ` +
    `origin "${appHost}". Untrusted app previews should be served from a separate registrable domain.`;
  console.warn(message);
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
