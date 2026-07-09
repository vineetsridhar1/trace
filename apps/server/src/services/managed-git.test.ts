import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { AuthorizationError, ValidationError } from "../lib/errors.js";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
    publishCreated: vi.fn(),
  },
}));

import { buildManagedGitUrl, managedGitService } from "./managed-git.js";
import { eventService } from "./event.js";
import { prisma } from "../lib/db.js";
import { createPrismaMock } from "../../test/helpers.js";

const ORG = "org-1";
const REPO = "repo-1";
const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const createEventMock = eventService.create as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("managed git tokens", () => {
  it("mints and verifies a scoped token round-trip", async () => {
    const { token, expiresAt } = await managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-instance-1",
      capabilities: ["read", "write"],
      sessionId: "session-1",
      actorType: "system",
      actorId: "system",
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const auth = managedGitService.verifyAccessToken(token);
    expect(auth).toEqual({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-instance-1",
      capabilities: ["read", "write"],
      sessionId: "session-1",
    });
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "managed_git_token_minted",
        payload: expect.objectContaining({ repoId: REPO, sessionId: "session-1" }),
      }),
      prismaMock,
    );
  });

  it("round-trips a session-bound token", async () => {
    const { token } = await managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-1",
      capabilities: ["read", "write"],
      sessionId: "session-abc",
      actorType: "system",
      actorId: "system",
    });
    expect(managedGitService.verifyAccessToken(token)?.sessionId).toBe("session-abc");
  });

  it("defaults user tokens to a short TTL and runtime tokens to a long one", async () => {
    const user = await managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "user",
      subject: "user-1",
      capabilities: ["read"],
      actorType: "user",
      actorId: "user-1",
    });
    const runtime = await managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: REPO,
      scope: "runtime",
      subject: "runtime-1",
      capabilities: ["read", "write"],
      sessionId: "session-1",
      actorType: "system",
      actorId: "system",
    });
    // User clone/export tokens are short-lived; runtime tokens live with the runtime.
    expect(runtime.expiresAt.getTime()).toBeGreaterThan(user.expiresAt.getTime());
  });

  it("requires at least one capability", async () => {
    await expect(
      managedGitService.mintAccessToken({
        organizationId: ORG,
        repoId: REPO,
        scope: "user",
        subject: "user-1",
        capabilities: [],
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("does not mint a user token for a different subject", async () => {
    await expect(
      managedGitService.mintAccessToken({
        organizationId: ORG,
        repoId: REPO,
        scope: "user",
        subject: "user-2",
        capabilities: ["read"],
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow(AuthorizationError);
    expect(createEventMock).not.toHaveBeenCalled();
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
  async function tokenWith(capabilities: ("read" | "write")[]): Promise<string> {
    return (
      await managedGitService.mintAccessToken({
        organizationId: ORG,
        repoId: REPO,
        scope: "runtime",
        subject: "runtime-1",
        capabilities,
        sessionId: "session-1",
        actorType: "system",
        actorId: "system",
      })
    ).token;
  }

  it("allows fetch with a read token and push with a write token", async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      repoId: REPO,
      sessionGroup: null,
      connection: { state: "connected", runtimeInstanceId: "runtime-1" },
    });
    const read = await tokenWith(["read"]);
    const write = await tokenWith(["read", "write"]);
    await expect(
      managedGitService.authorizeRequest({
        token: read,
        organizationId: ORG,
        repoId: REPO,
        service: "git-upload-pack",
      }),
    ).resolves.toBeTruthy();
    await expect(
      managedGitService.authorizeRequest({
        token: write,
        organizationId: ORG,
        repoId: REPO,
        service: "git-receive-pack",
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects a read-only token attempting to push", async () => {
    await expect(
      managedGitService.authorizeRequest({
        token: await tokenWith(["read"]),
        organizationId: ORG,
        repoId: REPO,
        service: "git-receive-pack",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects a missing token and cross-repo tokens", async () => {
    await expect(
      managedGitService.authorizeRequest({
        token: null,
        organizationId: ORG,
        repoId: REPO,
        service: "git-upload-pack",
      }),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      managedGitService.authorizeRequest({
        token: await tokenWith(["read", "write"]),
        organizationId: ORG,
        repoId: "other-repo",
        service: "git-upload-pack",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects a runtime token after its persisted runtime disconnects", async () => {
    const write = await tokenWith(["read", "write"]);
    prismaMock.session.findFirst.mockResolvedValue({
      repoId: REPO,
      sessionGroup: null,
      connection: { state: "disconnected", runtimeInstanceId: "runtime-1" },
    });
    await expect(
      managedGitService.authorizeRequest({
        token: write,
        organizationId: ORG,
        repoId: REPO,
        service: "git-upload-pack",
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});
