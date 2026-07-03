import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

vi.mock("../db.js", async () => {
  const { createPrismaMock } = await import("../../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./store.js", () => ({
  peekAuthorizationCode: vi.fn(),
  consumeAuthorizationCode: vi.fn(),
  issueRefreshToken: vi.fn(),
  lookupActiveRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  getOAuthClient: vi.fn(),
  registerOAuthClient: vi.fn(),
  savePendingAuthorization: vi.fn(),
}));

import { prisma } from "../db.js";
import { traceOAuthProvider } from "./provider.js";
import * as store from "./store.js";
import { resolveJwtSecret } from "../jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();
const prismaMock = prisma as ReturnType<typeof import("../../../test/helpers.js").createPrismaMock>;
const storeMock = store as unknown as Record<string, ReturnType<typeof vi.fn>>;

const client: OAuthClientInformationFull = {
  client_id: "client-1",
  redirect_uris: ["https://client.example/callback"],
};

describe("traceOAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a valid authorization code for access + refresh tokens", async () => {
    storeMock.consumeAuthorizationCode.mockResolvedValue({
      clientId: "client-1",
      userId: "user-1",
      organizationId: "org-1",
      redirectUri: "https://client.example/callback",
      codeChallenge: "challenge",
      scopes: [],
    });
    storeMock.issueRefreshToken.mockResolvedValue("refresh-abc");

    const tokens = await traceOAuthProvider.exchangeAuthorizationCode(client, "code-1");

    expect(tokens.token_type).toBe("bearer");
    expect(tokens.refresh_token).toBe("refresh-abc");
    const decoded = jwt.verify(tokens.access_token, JWT_SECRET) as {
      userId: string;
      organizationId: string;
    };
    expect(decoded.userId).toBe("user-1");
    expect(decoded.organizationId).toBe("org-1");
    expect(storeMock.issueRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", clientId: "client-1", organizationId: "org-1" }),
    );
  });

  it("rejects an authorization code issued to a different client", async () => {
    storeMock.consumeAuthorizationCode.mockResolvedValue({
      clientId: "someone-else",
      userId: "user-1",
      organizationId: "org-1",
      redirectUri: "https://client.example/callback",
      codeChallenge: "challenge",
      scopes: [],
    });

    await expect(traceOAuthProvider.exchangeAuthorizationCode(client, "code-1")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
  });

  it("rotates the refresh token on refresh", async () => {
    storeMock.lookupActiveRefreshToken.mockResolvedValue({
      userId: "user-1",
      clientId: "client-1",
      organizationId: "org-1",
      scopes: [],
    });
    storeMock.issueRefreshToken.mockResolvedValue("refresh-new");

    const tokens = await traceOAuthProvider.exchangeRefreshToken(client, "refresh-old");

    expect(storeMock.revokeRefreshToken).toHaveBeenCalledWith("refresh-old");
    expect(tokens.refresh_token).toBe("refresh-new");
  });

  it("rejects an unknown or revoked refresh token", async () => {
    storeMock.lookupActiveRefreshToken.mockResolvedValue(null);

    await expect(traceOAuthProvider.exchangeRefreshToken(client, "nope")).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
    expect(storeMock.issueRefreshToken).not.toHaveBeenCalled();
  });

  it("verifies a valid session access token", async () => {
    const token = jwt.sign(
      { userId: "user-1", organizationId: "org-1", tokenType: "session" },
      JWT_SECRET,
      { expiresIn: 3600 },
    );

    const info = await traceOAuthProvider.verifyAccessToken(token);

    expect(info.token).toBe(token);
    expect(info.extra?.userId).toBe("user-1");
    expect(info.extra?.organizationId).toBe("org-1");
  });

  it("rejects a bogus access token", async () => {
    prismaMock.mobileDevice.findUnique.mockResolvedValue(null);

    await expect(traceOAuthProvider.verifyAccessToken("not-a-jwt")).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it("revokes a refresh token", async () => {
    await traceOAuthProvider.revokeToken!(client, { token: "refresh-x" });
    expect(storeMock.revokeRefreshToken).toHaveBeenCalledWith("refresh-x");
  });
});
