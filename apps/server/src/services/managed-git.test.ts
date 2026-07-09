import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import { buildManagedGitUrl, managedGitService } from "./managed-git.js";

const ORG = "org-1";
const REPO = "repo-1";
const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";

describe("managed git tokens", () => {
  it("mints and verifies a scoped token round-trip", () => {
    const { token, expiresAt } = managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-instance-1",
      capabilities: ["read", "write"],
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const auth = managedGitService.verifyAccessToken(token);
    expect(auth).toEqual({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-instance-1",
      capabilities: ["read", "write"],
    });
  });

  it("defaults user tokens to a short TTL and runtime tokens to a long one", () => {
    const user = managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "user",
      subject: "user-1",
      capabilities: ["read"],
    });
    const runtime = managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-1",
      capabilities: ["read", "write"],
    });
    // User clone/export tokens are short-lived; runtime tokens live with the runtime.
    expect(runtime.expiresAt.getTime()).toBeGreaterThan(user.expiresAt.getTime());
  });

  it("requires at least one capability", () => {
    expect(() =>
      managedGitService.mintAccessToken({
        organizationId: ORG,
        repoId: REPO,
        scope: "user",
        subject: "user-1",
        capabilities: [],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects foreign, malformed, and non-managed-git tokens", () => {
    expect(managedGitService.verifyAccessToken("not-a-jwt")).toBeNull();
    const foreign = jwt.sign({ tokenType: "provisioned_runtime" }, JWT_SECRET);
    expect(managedGitService.verifyAccessToken(foreign)).toBeNull();
    const wrongSecret = jwt.sign({ tokenType: "managed_git" }, "different-secret");
    expect(managedGitService.verifyAccessToken(wrongSecret)).toBeNull();
  });

  it("builds a smart-HTTP clone URL", () => {
    const url = buildManagedGitUrl(ORG, REPO);
    expect(url.endsWith(`/git/${ORG}/${REPO}.git`)).toBe(true);
  });
});

describe("managed git authorization", () => {
  function tokenWith(capabilities: ("read" | "write")[]): string {
    return managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-1",
      capabilities,
    }).token;
  }

  it("allows fetch with a read token and push with a write token", () => {
    const read = tokenWith(["read"]);
    const write = tokenWith(["read", "write"]);
    expect(() =>
      managedGitService.authorizeRequest({
        token: read,
        organizationId: ORG,
        repoId: REPO,
        service: "git-upload-pack",
      }),
    ).not.toThrow();
    expect(() =>
      managedGitService.authorizeRequest({
        token: write,
        organizationId: ORG,
        repoId: REPO,
        service: "git-receive-pack",
      }),
    ).not.toThrow();
  });

  it("rejects a read-only token attempting to push", () => {
    expect(() =>
      managedGitService.authorizeRequest({
        token: tokenWith(["read"]),
        organizationId: ORG,
        repoId: REPO,
        service: "git-receive-pack",
      }),
    ).toThrow(AuthorizationError);
  });

  it("rejects a missing token and cross-repo tokens", () => {
    expect(() =>
      managedGitService.authorizeRequest({
        token: null,
        organizationId: ORG,
        repoId: REPO,
        service: "git-upload-pack",
      }),
    ).toThrow(AuthorizationError);

    expect(() =>
      managedGitService.authorizeRequest({
        token: tokenWith(["read", "write"]),
        organizationId: ORG,
        repoId: "other-repo",
        service: "git-upload-pack",
      }),
    ).toThrow(AuthorizationError);
  });
});
