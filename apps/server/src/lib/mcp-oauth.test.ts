import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import {
  buildAuthorizeUrl,
  discoverOAuthMetadata,
  exchangeCode,
  generatePkce,
  registerClient,
  refreshToken,
  type OAuthMetadata,
} from "./mcp-oauth.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function notFound(): Response {
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as unknown as Response;
}

const METADATA: OAuthMetadata = {
  issuer: "https://auth.example",
  authorizationEndpoint: "https://auth.example/authorize",
  tokenEndpoint: "https://auth.example/token",
  registrationEndpoint: "https://auth.example/register",
  scopesSupported: ["read", "write"],
};

describe("mcp-oauth", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("generatePkce", () => {
    it("produces a verifier and matching S256 challenge", () => {
      const { verifier, challenge } = generatePkce();
      const expected = createHash("sha256")
        .update(verifier)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(challenge).toBe(expected);
      expect(verifier).not.toContain("=");
    });
  });

  describe("discoverOAuthMetadata", () => {
    it("follows the protected-resource hop then reads AS metadata", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === "https://mcp.example/.well-known/oauth-protected-resource") {
          return jsonResponse({ authorization_servers: ["https://auth.example"] });
        }
        if (url === "https://auth.example/.well-known/oauth-authorization-server") {
          return jsonResponse({
            issuer: "https://auth.example",
            authorization_endpoint: "https://auth.example/authorize",
            token_endpoint: "https://auth.example/token",
            registration_endpoint: "https://auth.example/register",
            scopes_supported: ["read"],
          });
        }
        return notFound();
      });

      const metadata = await discoverOAuthMetadata("https://mcp.example/sse");
      expect(metadata.authorizationEndpoint).toBe("https://auth.example/authorize");
      expect(metadata.tokenEndpoint).toBe("https://auth.example/token");
      expect(metadata.registrationEndpoint).toBe("https://auth.example/register");
    });

    it("falls back to the server origin when no protected-resource doc exists", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === "https://mcp.example/.well-known/oauth-authorization-server") {
          return jsonResponse({
            authorization_endpoint: "https://mcp.example/authorize",
            token_endpoint: "https://mcp.example/token",
          });
        }
        return notFound();
      });

      const metadata = await discoverOAuthMetadata("https://mcp.example/mcp");
      expect(metadata.authorizationEndpoint).toBe("https://mcp.example/authorize");
    });

    it("throws when no metadata can be found", async () => {
      fetchMock.mockResolvedValue(notFound());
      await expect(discoverOAuthMetadata("https://mcp.example")).rejects.toThrow(
        /Could not discover OAuth metadata/,
      );
    });
  });

  describe("registerClient", () => {
    it("posts an RFC 7591 registration and returns the client id", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ client_id: "client-123", client_secret: "shh" }),
      );
      const client = await registerClient(METADATA, "https://trace.example/mcp/oauth/callback");
      expect(client.clientId).toBe("client-123");
      expect(client.clientSecret).toBe("shh");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://auth.example/register");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.redirect_uris).toEqual(["https://trace.example/mcp/oauth/callback"]);
      expect(body.grant_types).toContain("refresh_token");
    });

    it("throws when the AS does not support registration", async () => {
      await expect(
        registerClient({ ...METADATA, registrationEndpoint: undefined }, "https://x/cb"),
      ).rejects.toThrow(/dynamic client registration/i);
    });
  });

  describe("buildAuthorizeUrl", () => {
    it("includes PKCE S256 and the requested scope", () => {
      const url = new URL(
        buildAuthorizeUrl({
          metadata: METADATA,
          clientId: "client-123",
          redirectUri: "https://trace.example/mcp/oauth/callback",
          state: "state-token",
          codeChallenge: "challenge",
          scope: "read write",
          resource: "https://mcp.example/mcp",
        }),
      );
      expect(url.origin + url.pathname).toBe("https://auth.example/authorize");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("code_challenge")).toBe("challenge");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("scope")).toBe("read write");
      expect(url.searchParams.get("state")).toBe("state-token");
      expect(url.searchParams.get("resource")).toBe("https://mcp.example/mcp");
    });

    it("defaults scope to the discovered scopes_supported", () => {
      const url = new URL(
        buildAuthorizeUrl({
          metadata: METADATA,
          clientId: "c",
          redirectUri: "https://x/cb",
          state: "s",
          codeChallenge: "ch",
        }),
      );
      expect(url.searchParams.get("scope")).toBe("read write");
    });
  });

  describe("exchangeCode", () => {
    it("exchanges an authorization code and parses expiry", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          scope: "read",
        }),
      );
      const result = await exchangeCode({
        metadata: METADATA,
        clientId: "client-123",
        code: "auth-code",
        redirectUri: "https://x/cb",
        codeVerifier: "verifier",
        resource: "https://mcp.example/mcp",
      });
      expect(result.accessToken).toBe("access-1");
      expect(result.refreshToken).toBe("refresh-1");
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());

      const [, init] = fetchMock.mock.calls[0];
      const body = new URLSearchParams((init as RequestInit).body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code_verifier")).toBe("verifier");
      expect(body.get("resource")).toBe("https://mcp.example/mcp");
    });

    it("throws on a non-ok token response", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, false, 400));
      await expect(
        exchangeCode({
          metadata: METADATA,
          clientId: "c",
          code: "bad",
          redirectUri: "https://x/cb",
          codeVerifier: "v",
        }),
      ).rejects.toThrow(/Token request failed/);
    });
  });

  describe("refreshToken", () => {
    it("carries the old refresh token forward when the server omits a new one", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ access_token: "access-2", expires_in: 600 }),
      );
      const result = await refreshToken({
        metadata: METADATA,
        clientId: "client-123",
        refreshToken: "refresh-old",
        resource: "https://mcp.example/mcp",
      });
      expect(result.accessToken).toBe("access-2");
      expect(result.refreshToken).toBe("refresh-old");
      const [, init] = fetchMock.mock.calls[0];
      const body = new URLSearchParams((init as RequestInit).body as string);
      expect(body.get("resource")).toBe("https://mcp.example/mcp");
    });
  });
});
