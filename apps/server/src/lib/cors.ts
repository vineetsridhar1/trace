import type { IncomingHttpHeaders } from "http";

export interface AllowedCorsOriginsOptions {
  localMode: boolean;
  nodeEnv?: string;
  traceWebUrl?: string;
  corsAllowedOrigins?: string;
}

export function getAllowedCorsOrigins(options: AllowedCorsOriginsOptions): Set<string> {
  const origins = new Set<string>();
  const traceWebUrl = options.traceWebUrl?.trim();
  if (traceWebUrl) {
    origins.add(traceWebUrl);
  }

  const configuredOrigins = options.corsAllowedOrigins;
  if (configuredOrigins) {
    for (const value of configuredOrigins.split(",")) {
      const trimmed = value.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  if (options.localMode || options.nodeEnv !== "production") {
    // Vite auto-increments the port when 3000 is taken (e.g. by an ssh tunnel),
    // so allow a small range of localhost ports in dev/local mode.
    for (let port = 3000; port <= 3009; port++) {
      origins.add(`http://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
    }
  }

  if (!options.localMode && options.nodeEnv === "production" && origins.size === 0) {
    throw new Error("Explicit CORS origins are required in production");
  }

  return origins;
}

export function isCorsOriginAllowed(allowedOrigins: Set<string>, origin?: string): boolean {
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

export function readHeaderValue(headers: IncomingHttpHeaders, key: string): string | undefined {
  const value = headers[key.toLowerCase()] ?? headers[key];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof first === "string" ? first.trim() : "";
  return trimmed || undefined;
}

export function readOriginFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function getRequestOrigin(headers: IncomingHttpHeaders): string | undefined {
  return (
    readHeaderValue(headers, "origin") ?? readOriginFromReferer(readHeaderValue(headers, "referer"))
  );
}

export function isAllowedBrowserOrigin(
  allowedOrigins: Set<string>,
  headers: IncomingHttpHeaders,
): boolean {
  const origin = getRequestOrigin(headers);
  return Boolean(origin && allowedOrigins.has(origin));
}

export function hasSessionCookie(headers: IncomingHttpHeaders): boolean {
  const cookie = readHeaderValue(headers, "cookie");
  return /(?:^|;\s*)trace_token=/.test(cookie ?? "");
}

export function shouldRejectCredentialedBrowserUpgrade(
  allowedOrigins: Set<string>,
  headers: IncomingHttpHeaders,
): boolean {
  return (
    Boolean(readHeaderValue(headers, "origin")) &&
    hasSessionCookie(headers) &&
    !isAllowedBrowserOrigin(allowedOrigins, headers)
  );
}
