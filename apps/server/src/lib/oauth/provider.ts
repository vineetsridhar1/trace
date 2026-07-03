import { randomBytes } from "crypto";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidTokenError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { authenticateAccessToken } from "../auth.js";
import { resolveJwtSecret } from "../jwt-secret.js";
import { buildGitHubWebAuthorizeUrl, resolveDefaultOrganizationId } from "../../services/github-auth.js";
import { githubCallbackUrl } from "./config.js";
import {
  consumeAuthorizationCode,
  getOAuthClient,
  issueRefreshToken,
  lookupActiveRefreshToken,
  peekAuthorizationCode,
  registerOAuthClient,
  revokeRefreshToken,
  savePendingAuthorization,
} from "./store.js";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const JWT_SECRET = resolveJwtSecret();

function mintAccessToken(userId: string, organizationId: string): { token: string; expiresIn: number } {
  const token = jwt.sign({ userId, organizationId, tokenType: "session" }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

async function buildTokens(input: {
  userId: string;
  clientId: string;
  organizationId: string;
  scopes: string[];
}): Promise<OAuthTokens> {
  const access = mintAccessToken(input.userId, input.organizationId);
  const refreshToken = await issueRefreshToken(input);
  return {
    access_token: access.token,
    token_type: "bearer",
    expires_in: access.expiresIn,
    refresh_token: refreshToken,
    scope: input.scopes.join(" ") || undefined,
  };
}

const clientsStore: OAuthRegisteredClientsStore = {
  getClient: (clientId) => getOAuthClient(clientId),
  registerClient: (client) => registerOAuthClient(client),
};

export const traceOAuthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const githubState = randomBytes(32).toString("base64url");
    await savePendingAuthorization(githubState, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      clientState: params.state,
      scopes: params.scopes ?? [],
      resource: params.resource?.toString(),
    });
    res.redirect(
      buildGitHubWebAuthorizeUrl({ state: githubState, redirectUri: githubCallbackUrl() }),
    );
  },

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = await peekAuthorizationCode(authorizationCode);
    if (!record) throw new InvalidGrantError("Authorization code is invalid or expired");
    return record.codeChallenge;
  },

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const record = await consumeAuthorizationCode(authorizationCode);
    if (!record) throw new InvalidGrantError("Authorization code is invalid or expired");
    if (record.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was issued to a different client");
    }
    return buildTokens({
      userId: record.userId,
      clientId: client.client_id,
      organizationId: record.organizationId,
      scopes: record.scopes,
    });
  },

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const active = await lookupActiveRefreshToken(refreshToken);
    if (!active || active.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token is invalid or expired");
    }
    // Rotate: the presented refresh token is single-use.
    await revokeRefreshToken(refreshToken);
    return buildTokens({
      userId: active.userId,
      clientId: client.client_id,
      organizationId: active.organizationId,
      scopes: scopes ?? active.scopes,
    });
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const subject = await authenticateAccessToken(token);
    if (!subject || subject.kind !== "session") {
      throw new InvalidTokenError("Invalid Trace access token");
    }
    const decoded = jwt.decode(token) as { exp?: number } | null;
    return {
      token,
      clientId: "",
      scopes: [],
      ...(decoded?.exp ? { expiresAt: decoded.exp } : {}),
      extra: {
        userId: subject.userId,
        organizationId: subject.organizationId,
        channelId: subject.channelId,
      },
    };
  },

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    try {
      await revokeRefreshToken(request.token);
    } catch (error) {
      throw new ServerError((error as Error).message);
    }
  },
};

export async function resolveOrganizationForUser(userId: string): Promise<string | null> {
  return resolveDefaultOrganizationId(userId);
}
