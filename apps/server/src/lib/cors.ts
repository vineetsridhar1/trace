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
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
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
