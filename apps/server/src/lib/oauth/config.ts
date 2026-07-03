const DEFAULT_GITHUB_CALLBACK_PATH = "/oauth/github/callback";

/** Public origin of this server, used as the OAuth issuer. */
export function oauthIssuerUrl(): URL {
  const raw = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (raw) return new URL(raw.replace(/\/+$/, ""));
  // Falls back to loopback for local dev; GitHub web-flow callbacks require a
  // real public URL, but token verification and metadata still work locally.
  return new URL(`http://localhost:${process.env.PORT ?? 4000}`);
}

/** The protected resource (the hosted MCP endpoint) whose metadata we advertise. */
export function mcpResourceServerUrl(): URL {
  return new URL("/mcp", oauthIssuerUrl());
}

/** Where GitHub redirects back after the user authenticates the web flow. */
export function githubCallbackUrl(): string {
  const fullUrl = process.env.MCP_OAUTH_GITHUB_CALLBACK_URL?.trim();
  if (fullUrl) return new URL(fullUrl).toString();

  const path = process.env.MCP_OAUTH_GITHUB_CALLBACK_PATH?.trim() || DEFAULT_GITHUB_CALLBACK_PATH;
  return new URL(path, oauthIssuerUrl()).toString();
}
