import express from "express";
import { createServer, type Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/github-auth.js", () => ({
  autoJoinOrganizationIfMember: vi.fn(),
  exchangeGitHubWebCode: vi.fn(),
  upsertUserFromGitHubAccessToken: vi.fn(),
}));

vi.mock("../lib/oauth/provider.js", () => ({
  resolveOrganizationForUser: vi.fn(),
}));

vi.mock("../lib/oauth/store.js", () => ({
  consumePendingAuthorization: vi.fn(),
  generateAuthorizationCode: vi.fn(),
  saveAuthorizationCode: vi.fn(),
}));

import {
  autoJoinOrganizationIfMember,
  exchangeGitHubWebCode,
  upsertUserFromGitHubAccessToken,
} from "../services/github-auth.js";
import { resolveOrganizationForUser } from "../lib/oauth/provider.js";
import {
  consumePendingAuthorization,
  generateAuthorizationCode,
  saveAuthorizationCode,
} from "../lib/oauth/store.js";
import { createOAuthGithubRouter } from "./oauth-github.js";

const githubAuthMock = {
  autoJoinOrganizationIfMember: vi.mocked(autoJoinOrganizationIfMember),
  exchangeGitHubWebCode: vi.mocked(exchangeGitHubWebCode),
  upsertUserFromGitHubAccessToken: vi.mocked(upsertUserFromGitHubAccessToken),
};
const providerMock = {
  resolveOrganizationForUser: vi.mocked(resolveOrganizationForUser),
};
const storeMock = {
  consumePendingAuthorization: vi.mocked(consumePendingAuthorization),
  generateAuthorizationCode: vi.mocked(generateAuthorizationCode),
  saveAuthorizationCode: vi.mocked(saveAuthorizationCode),
};

describe("OAuth GitHub callback route", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.infra.opendoor.com");
    vi.stubEnv(
      "MCP_OAUTH_GITHUB_CALLBACK_URL",
      "https://trace.infra.internal.opendoor.com/auth/github/callback/mcp",
    );

    const app = express();
    app.use(createOAuthGithubRouter());
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("handles the configured callback path", async () => {
    storeMock.consumePendingAuthorization.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/auth/github/callback/mcp?code=github-code&state=missing`);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Sign-in expired");
  });

  it("uses the configured callback URL when exchanging the GitHub code", async () => {
    storeMock.consumePendingAuthorization.mockResolvedValue({
      clientId: "client-1",
      redirectUri: "http://127.0.0.1:5555/callback",
      codeChallenge: "challenge",
      scopes: [],
    });
    githubAuthMock.exchangeGitHubWebCode.mockResolvedValue({ access_token: "github-token" });
    githubAuthMock.upsertUserFromGitHubAccessToken.mockResolvedValue({
      id: "user-1",
      email: "octo@example.com",
      name: "Octo",
      githubId: 42,
      avatarUrl: "https://example.com/octo.png",
    });
    providerMock.resolveOrganizationForUser.mockResolvedValue("org-1");
    storeMock.generateAuthorizationCode.mockReturnValue("trace-code");

    const res = await fetch(`${baseUrl}/auth/github/callback/mcp?code=github-code&state=state-1`, {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(githubAuthMock.exchangeGitHubWebCode).toHaveBeenCalledWith(
      "github-code",
      "https://trace.infra.internal.opendoor.com/auth/github/callback/mcp",
    );
    expect(githubAuthMock.autoJoinOrganizationIfMember).toHaveBeenCalledWith(
      "user-1",
      "github-token",
    );
    expect(storeMock.saveAuthorizationCode).toHaveBeenCalledWith(
      "trace-code",
      expect.objectContaining({
        clientId: "client-1",
        userId: "user-1",
        organizationId: "org-1",
      }),
    );
    expect(res.headers.get("location")).toBe("http://127.0.0.1:5555/callback?code=trace-code");
  });
});
