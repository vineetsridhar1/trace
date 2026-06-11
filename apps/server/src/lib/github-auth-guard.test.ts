import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./mode.js", () => ({ isLocalMode: vi.fn() }));

import { assertGitHubOrgAccess } from "./github-auth-guard.js";
import { AuthenticationError, AuthorizationError } from "./errors.js";
import { isLocalMode } from "./mode.js";

const isLocalModeMock = vi.mocked(isLocalMode);

function mockGitHubResponse(ok: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok }) as Response),
  );
}

describe("assertGitHubOrgAccess", () => {
  beforeEach(() => {
    isLocalModeMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rejects when no GitHub token is provided", async () => {
    await expect(
      assertGitHubOrgAccess({ githubToken: null, organizationId: "org-1" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects when GitHub reports the token is invalid", async () => {
    mockGitHubResponse(false);
    await expect(
      assertGitHubOrgAccess({ githubToken: "bad-token", organizationId: "org-1" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a valid token when the user has no organization", async () => {
    mockGitHubResponse(true);
    await expect(
      assertGitHubOrgAccess({ githubToken: "good-token", organizationId: null }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("passes with a valid token and organization membership", async () => {
    mockGitHubResponse(true);
    await expect(
      assertGitHubOrgAccess({ githubToken: "good-token", organizationId: "org-1" }),
    ).resolves.toBeUndefined();
  });

  it("skips all checks in local mode", async () => {
    isLocalModeMock.mockReturnValue(true);
    await expect(
      assertGitHubOrgAccess({ githubToken: null, organizationId: null }),
    ).resolves.toBeUndefined();
  });
});
