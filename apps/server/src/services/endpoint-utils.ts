import { randomBytes } from "crypto";
import type { EndpointTrafficCaptureMode } from "@prisma/client";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function endpointPreviewBaseHost(): string {
  return process.env.TRACE_ENDPOINT_PREVIEW_BASE_HOST?.trim() || "preview.localhost";
}

export function endpointPreviewScheme(): string {
  return process.env.TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME?.trim() || "http";
}

export function endpointPreviewCookieDomain(): string {
  return `.${endpointPreviewBaseHost().split(":")[0]}`;
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

export function buildEndpointUrl(key: string, sub?: string | null): string {
  const label = sub ? `${sub}--${key}` : key;
  return `${endpointPreviewScheme()}://${label}.${endpointPreviewBaseHost()}`;
}

// Host-mode endpoints (internalHostTemplate set) route by hostname inside the
// container; `www` is the conventional public entry sub.
export const ENDPOINT_DEFAULT_SUB = "www";

export function buildEndpointPublicUrl(endpoint: {
  key: string;
  internalHostTemplate?: string | null;
}): string {
  return buildEndpointUrl(
    endpoint.key,
    endpoint.internalHostTemplate ? ENDPOINT_DEFAULT_SUB : null,
  );
}

// Public URL pattern with `{sub}` preserved, for applications that need to
// construct links to arbitrary subs of a host-mode endpoint.
export function buildEndpointHostPattern(key: string): string {
  return buildEndpointUrl(key, "{sub}");
}

export function generateEndpointKey(length = 12): string {
  const bytes = randomBytes(length);
  let key = "";
  for (const byte of bytes) {
    key += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
  }
  return key;
}

const ENDPOINT_KEY_PATTERN = /^[a-z2-7]+$/;
const ENDPOINT_SUB_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Parse `<key>.<baseHost>` (sub: null) or `<sub>--<key>.<baseHost>` — a single
// DNS label, so the wildcard preview TLS cert still covers it.
export function extractEndpointHost(
  hostHeader: string | undefined | null,
): { key: string; sub: string | null } | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0]?.toLowerCase();
  const baseHost = endpointPreviewBaseHost().toLowerCase().split(":")[0];
  if (!host || host === baseHost || !host.endsWith(`.${baseHost}`)) return null;
  // The endpoint must be exactly one label under the base host. Reject deeper
  // subdomains (`evil.<key>.<baseHost>`) so one endpoint isn't reachable from
  // unbounded origins that could script/set cookies across the isolation seam.
  const prefix = host.slice(0, -1 * `.${baseHost}`.length);
  const separator = prefix.lastIndexOf("--");
  if (separator === -1) {
    return /^[a-z0-9-]+$/.test(prefix) ? { key: prefix, sub: null } : null;
  }
  const sub = prefix.slice(0, separator);
  const key = prefix.slice(separator + 2);
  if (!ENDPOINT_KEY_PATTERN.test(key)) return null;
  if (sub.includes("--") || !ENDPOINT_SUB_PATTERN.test(sub)) return null;
  return { key, sub };
}

export function extractEndpointKey(hostHeader: string | undefined | null): string | null {
  return extractEndpointHost(hostHeader)?.key ?? null;
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

function originEndpointIdentity(
  origin: string | undefined,
): { key: string; sub: string | null } | null {
  if (!origin) return null;
  try {
    return extractEndpointHost(new URL(origin).host);
  } catch {
    return null;
  }
}

// Host-mode endpoints route by hostname inside the container, so Host is
// always rewritten to the endpoint's internal host to pick the right
// upstream. Origin is only rewritten to match when the browser's Origin is
// this exact endpoint+sub's own preview origin (same-origin app traffic,
// e.g. a dev server's own HMR same-origin check) — otherwise the request is
// genuinely cross-origin (one sub's browser JS calling another sub's API, or
// an external caller), and the real Origin must reach the app unchanged so
// its own CORS logic can validate it. Applied after forwardableRequestHeaders
// so the credential/hop-by-hop filtering is unaffected.
export function applyInternalHostHeaders(
  headers: Record<string, string | string[]>,
  internalHost: string | null,
  endpointIdentity?: { key: string; sub: string | null } | null,
): Record<string, string | string[]> {
  if (!internalHost) return headers;
  const rewritten: Record<string, string | string[]> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (name === "host") continue;
    if (name === "origin") {
      const origin = Array.isArray(value) ? value[0] : value;
      const originIdentity = originEndpointIdentity(origin);
      const isSameOrigin =
        endpointIdentity != null &&
        originIdentity != null &&
        originIdentity.key === endpointIdentity.key &&
        originIdentity.sub === endpointIdentity.sub;
      if (isSameOrigin) {
        rewritten.origin = `http://${internalHost}`;
      } else if (origin) {
        rewritten.origin = origin;
      }
      continue;
    }
    rewritten[rawName] = value;
  }
  rewritten.host = internalHost;
  return rewritten;
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
function filterSetCookieDomain(setCookie: string, allowedDomain?: string): string {
  const normalizedAllowedDomain = allowedDomain?.toLowerCase();
  return setCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      return (
        part.length > 0 &&
        (!part.toLowerCase().startsWith("domain=") ||
          part.slice("domain=".length).trim().toLowerCase() === normalizedAllowedDomain)
      );
    })
    .join("; ");
}

// Strip hop-by-hop headers from the application's response before relaying it
// back to the caller; the proxy manages framing itself. Set-Cookie is forwarded
// host-only unless the caller supplies the one domain explicitly allowed for a
// trusted endpoint.
export function forwardableResponseHeaders(
  headers: Record<string, string | string[]>,
  options?: { disableCache?: boolean; allowedCookieDomain?: string },
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
        ? value.map((cookie) => filterSetCookieDomain(cookie, options?.allowedCookieDomain))
        : filterSetCookieDomain(value, options?.allowedCookieDomain);
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
