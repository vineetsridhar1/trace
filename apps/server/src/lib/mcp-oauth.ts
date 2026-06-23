import { createHash, randomBytes } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * OAuth helpers for connecting to remote MCP servers.
 *
 * Implements the slice of the MCP authorization spec we need:
 *   - Authorization Server Metadata discovery (RFC 8414) with the
 *     Protected Resource Metadata hop (RFC 9728) the MCP spec mandates.
 *   - Dynamic Client Registration (RFC 7591) so admins only enter a URL.
 *   - Authorization Code + PKCE (S256) and refresh-token grants (RFC 6749/7636).
 *
 * Everything here uses only `fetch` + crypto (no DB/encryption), so it can be
 * unit-tested with a mocked fetch.
 */

export interface OAuthMetadata {
  issuer?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  scopesSupported?: string[];
}

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generatePkce(): PkcePair {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function originOf(serverUrl: string): string {
  return new URL(serverUrl).origin;
}

/** Public callback URL the OAuth broker route is mounted at. */
export function mcpRedirectUri(): string {
  const base =
    process.env.TRACE_SERVER_PUBLIC_URL?.trim() || `http://localhost:${process.env.PORT ?? 4000}`;
  return new URL("/mcp/oauth/callback", base).toString();
}

/**
 * Whether private/loopback/link-local hosts are permitted as MCP targets.
 * Allowed in non-production (local dev points at localhost) or when explicitly
 * opted in for self-hosted deployments with internal MCP servers.
 */
function privateHostsAllowed(): boolean {
  return (
    process.env.TRACE_MCP_ALLOW_PRIVATE_HOSTS === "true" || process.env.NODE_ENV !== "production"
  );
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const n = ipv4ToInt(address);
    if (n === null) return true;
    const inRange = (cidr: string, bits: number) =>
      (n >>> (32 - bits)) === ((ipv4ToInt(cidr)! >>> (32 - bits)) >>> 0);
    return (
      inRange("0.0.0.0", 8) || // "this" network / unspecified
      inRange("10.0.0.0", 8) ||
      inRange("100.64.0.0", 10) || // CGNAT
      inRange("127.0.0.0", 8) || // loopback
      inRange("169.254.0.0", 16) || // link-local (incl. cloud metadata 169.254.169.254)
      inRange("172.16.0.0", 12) ||
      inRange("192.168.0.0", 16)
    );
  }
  if (family === 6) {
    const addr = address.toLowerCase();
    if (addr === "::1" || addr === "::") return true;
    if (addr.startsWith("fe80")) return true; // link-local
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local fc00::/7
    if (addr.startsWith("::ffff:")) {
      const mapped = addr.slice(7);
      if (isIP(mapped) === 4) return isPrivateAddress(mapped);
    }
    return false;
  }
  return false;
}

/**
 * SSRF guard: reject MCP/OAuth hosts that resolve to private, loopback, or
 * link-local addresses (e.g. cloud metadata endpoints). Even though the
 * mutations are admin-gated, an admin should not be able to point Trace's
 * server at its own internal network.
 */
export async function assertSafeMcpUrl(rawUrl: string): Promise<void> {
  if (privateHostsAllowed()) return;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid MCP server URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("MCP server URL must use https in production");
  }
  const host = url.hostname;
  const addresses =
    isIP(host) !== 0 ? [{ address: host }] : await lookup(host, { all: true }).catch(() => null);
  if (!addresses || addresses.length === 0) {
    throw new Error("Could not resolve MCP server host");
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error("MCP server host resolves to a private or loopback address");
    }
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length ? out : undefined;
}

function metadataFromDoc(doc: Record<string, unknown>): OAuthMetadata | null {
  const authorizationEndpoint = asString(doc.authorization_endpoint);
  const tokenEndpoint = asString(doc.token_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) return null;
  return {
    issuer: asString(doc.issuer),
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: asString(doc.registration_endpoint),
    revocationEndpoint: asString(doc.revocation_endpoint),
    scopesSupported: asStringArray(doc.scopes_supported),
  };
}

/**
 * Discover the authorization server metadata for an MCP server URL.
 *
 * Per the MCP spec the server may advertise its authorization server via
 * Protected Resource Metadata; we follow that hop when present, otherwise we
 * fall back to treating the MCP server's own origin as the issuer.
 */
export async function discoverOAuthMetadata(serverUrl: string): Promise<OAuthMetadata> {
  await assertSafeMcpUrl(serverUrl);
  const origin = originOf(serverUrl);

  const protectedResource = await fetchJson(`${origin}/.well-known/oauth-protected-resource`);
  const authServers = asStringArray(protectedResource?.authorization_servers);
  const issuer = authServers?.[0] ?? origin;
  const issuerOrigin = originOf(issuer);
  await assertSafeMcpUrl(issuerOrigin);

  for (const wellKnown of [
    `${issuerOrigin}/.well-known/oauth-authorization-server`,
    `${issuerOrigin}/.well-known/openid-configuration`,
  ]) {
    const doc = await fetchJson(wellKnown);
    if (doc) {
      const metadata = metadataFromDoc(doc);
      if (metadata) return metadata;
    }
  }

  throw new Error(`Could not discover OAuth metadata for MCP server at ${serverUrl}`);
}

/**
 * Register an OAuth client via Dynamic Client Registration (RFC 7591).
 * Returns the client_id (and client_secret for confidential clients).
 */
export async function registerClient(
  metadata: OAuthMetadata,
  redirectUri: string,
  clientName = "Trace",
): Promise<RegisteredClient> {
  if (!metadata.registrationEndpoint) {
    throw new Error("MCP authorization server does not support dynamic client registration");
  }

  const res = await fetch(metadata.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  if (!res.ok) {
    throw new Error(`Dynamic client registration failed (${res.status})`);
  }

  const doc = (await res.json()) as Record<string, unknown>;
  const clientId = asString(doc.client_id);
  if (!clientId) throw new Error("Dynamic client registration returned no client_id");
  return { clientId, clientSecret: asString(doc.client_secret) };
}

export function buildAuthorizeUrl(params: {
  metadata: OAuthMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  resource?: string;
}): string {
  const url = new URL(params.metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  const scope = params.scope ?? params.metadata.scopesSupported?.join(" ");
  if (scope) url.searchParams.set("scope", scope);
  if (params.resource) url.searchParams.set("resource", params.resource);
  return url.toString();
}

function parseTokenResponse(doc: Record<string, unknown>): TokenResponse {
  const accessToken = asString(doc.access_token);
  if (!accessToken) throw new Error("Token endpoint returned no access_token");
  const expiresIn = typeof doc.expires_in === "number" ? doc.expires_in : undefined;
  return {
    accessToken,
    refreshToken: asString(doc.refresh_token),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scope: asString(doc.scope),
  };
}

async function tokenRequest(
  tokenEndpoint: string,
  body: Record<string, string>,
  clientSecret?: string,
): Promise<TokenResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const form = new URLSearchParams(body);
  if (clientSecret) {
    const basic = Buffer.from(`${body.client_id}:${clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  const res = await fetch(tokenEndpoint, { method: "POST", headers, body: form.toString() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Token request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return parseTokenResponse((await res.json()) as Record<string, unknown>);
}

export async function exchangeCode(params: {
  metadata: OAuthMetadata;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  };
  if (params.resource) body.resource = params.resource;
  return tokenRequest(params.metadata.tokenEndpoint, body, params.clientSecret);
}

export async function refreshToken(params: {
  metadata: OAuthMetadata;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  scope?: string;
  resource?: string;
}): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  };
  if (params.scope) body.scope = params.scope;
  if (params.resource) body.resource = params.resource;
  const result = await tokenRequest(params.metadata.tokenEndpoint, body, params.clientSecret);
  // Some servers omit refresh_token on refresh — carry the old one forward.
  return { ...result, refreshToken: result.refreshToken ?? params.refreshToken };
}

/**
 * Best-effort token revocation (RFC 7009). Returns false instead of throwing
 * when the server doesn't advertise a revocation endpoint or the request fails
 * — revocation is a courtesy cleanup, not a correctness requirement.
 */
export async function revokeToken(params: {
  metadata: OAuthMetadata;
  clientId: string;
  clientSecret?: string;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
}): Promise<boolean> {
  if (!params.metadata.revocationEndpoint) return false;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const body: Record<string, string> = { token: params.token, client_id: params.clientId };
  if (params.tokenTypeHint) body.token_type_hint = params.tokenTypeHint;
  if (params.clientSecret) {
    const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  try {
    const res = await fetch(params.metadata.revocationEndpoint, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
