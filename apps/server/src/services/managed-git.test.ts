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

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    getUploadTarget: vi.fn().mockResolvedValue({ method: "PUT", url: "https://upload.test" }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: { send: vi.fn().mockReturnValue("delivered") },
}));

vi.mock("../lib/git-storage/index.js", () => ({
  gitStorage: {
    listRefs: vi.fn().mockResolvedValue(new Map()),
    readFileAtCommit: vi.fn().mockResolvedValue(null),
  },
}));

import { buildManagedGitUrl, managedGitService } from "./managed-git.js";
import { eventService } from "./event.js";
import { prisma } from "../lib/db.js";
import { createPrismaMock } from "../../test/helpers.js";
import { sessionRouter } from "../lib/session-router.js";
import { gitStorage } from "../lib/git-storage/index.js";

const ORG = "org-1";
const REPO = "repo-1";
const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const createEventMock = eventService.create as unknown as ReturnType<typeof vi.fn>;
const gitStorageMock = gitStorage as unknown as {
  listRefs: ReturnType<typeof vi.fn>;
  readFileAtCommit: ReturnType<typeof vi.fn>;
};

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

describe("managed git PDF exports", () => {
  it("sends a PDF export command to the bridge after an accepted branch push", async () => {
    // Design, PDF, and animation exports are dispatched concurrently from the
    // same push and each issues its own kind-filtered findMany — branch on
    // the query's `kind` rather than call order, which is not guaranteed
    // across concurrent branches with differing internal await timing.
    prismaMock.sessionGroup.findMany.mockImplementation((args?: { where?: { kind?: string } }) =>
      Promise.resolve(
        args?.where?.kind === "pdf"
          ? [
              {
                id: "pdf-group-1",
                branch: null,
                pdfPageWidth: 210,
                pdfPageHeight: 297,
                pdfPageUnit: "mm",
                pdfFormatVersion: 0,
                pdfExportKey: null,
                pdfExportPendingKey: null,
                sessions: [
                  {
                    id: "session-1",
                    connection: { state: "connected", runtimeInstanceId: "runtime-1" },
                  },
                ],
              },
            ]
          : [],
      ),
    );
    prismaMock.sessionGroup.update.mockResolvedValue({ id: "pdf-group-1" });

    await managedGitService.recordPush({
      organizationId: ORG,
      repoId: REPO,
      commands: [
        {
          ref: "refs/heads/main",
          oldSha: "a".repeat(40),
          newSha: "b".repeat(40),
        },
      ],
      actorType: "system",
      actorId: "runtime-1",
    });

    expect(sessionRouter.send).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        type: "pdf_export",
        sessionGroupId: "pdf-group-1",
        commitSha: "b".repeat(40),
        format: { width: 210, height: 297, unit: "mm" },
      }),
      { expectedHomeRuntimeId: "runtime-1", organizationId: ORG },
    );
    expect(prismaMock.sessionGroup.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ branch: "main" }, { branch: null, repo: { is: { defaultBranch: "main" } } }],
          kind: "pdf",
        }),
      }),
    );
    expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branch: "main", pdfExportStatus: "publishing" }),
      }),
    );
  });

  it("renders the committed page format and advances its durable version", async () => {
    gitStorageMock.readFileAtCommit.mockResolvedValueOnce(
      JSON.stringify({ width: 297, height: 297, unit: "mm" }),
    );
    prismaMock.sessionGroup.findMany.mockImplementation((args?: { where?: { kind?: string } }) =>
      Promise.resolve(
        args?.where?.kind === "pdf"
          ? [
              {
                id: "pdf-group-1",
                branch: "main",
                pdfPageWidth: 210,
                pdfPageHeight: 297,
                pdfPageUnit: "mm",
                pdfFormatVersion: 2,
                pdfExportKey: null,
                pdfExportPendingKey: null,
                sessions: [
                  {
                    id: "session-1",
                    connection: { state: "connected", runtimeInstanceId: "runtime-1" },
                  },
                ],
              },
            ]
          : [],
      ),
    );
    prismaMock.sessionGroup.update.mockResolvedValue({
      id: "pdf-group-1",
      pdfExportStatus: "publishing",
      pdfExportCommitSha: "b".repeat(40),
      pdfExportCapturedAt: null,
      pdfExportError: null,
      pdfPageWidth: 297,
      pdfPageHeight: 297,
      pdfPageUnit: "mm",
      pdfFormatVersion: 3,
    });

    await managedGitService.recordPush({
      organizationId: ORG,
      repoId: REPO,
      commands: [{ ref: "refs/heads/main", oldSha: "a".repeat(40), newSha: "b".repeat(40) }],
      actorType: "system",
      actorId: "runtime-1",
    });

    expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pdfPageWidth: 297,
          pdfPageHeight: 297,
          pdfPageUnit: "mm",
          pdfFormatVersion: 3,
          pdfExportFormatVersion: 3,
        }),
      }),
    );
    expect(sessionRouter.send).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ format: { width: 297, height: 297, unit: "mm" } }),
      expect.any(Object),
    );
  });

  it.each([
    { status: "failed", attemptedAt: new Date() },
    { status: "publishing", attemptedAt: new Date(0) },
  ])(
    "retries a $status export even when an older artifact exists",
    async ({ status, attemptedAt }) => {
      const commitSha = "c".repeat(40);
      gitStorageMock.listRefs.mockResolvedValue(new Map([["refs/heads/main", commitSha]]));
      prismaMock.sessionGroup.findUnique.mockResolvedValue({
        id: "pdf-group-1",
        kind: "pdf",
        organizationId: ORG,
        repoId: REPO,
        branch: "main",
        pdfExportStatus: status,
        pdfExportKey: "pdf-exports/org-1/pdf-group-1/old.pdf",
        pdfExportCommitSha: commitSha,
        pdfExportFormatVersion: 1,
        pdfFormatVersion: 1,
        pdfExportAttemptedAt: attemptedAt,
        repo: { defaultBranch: "main" },
      });
      prismaMock.sessionGroup.findMany.mockResolvedValue([
        {
          id: "pdf-group-1",
          branch: "main",
          pdfPageWidth: 297,
          pdfPageHeight: 297,
          pdfPageUnit: "mm",
          pdfFormatVersion: 1,
          pdfExportKey: "pdf-exports/org-1/pdf-group-1/old.pdf",
          pdfExportPendingKey: null,
          sessions: [
            { id: "session-1", connection: { state: "connected", runtimeInstanceId: "runtime-1" } },
          ],
        },
      ]);
      prismaMock.sessionGroup.update.mockResolvedValue({
        id: "pdf-group-1",
        pdfExportStatus: "publishing",
        pdfExportCommitSha: commitSha,
        pdfExportCapturedAt: null,
        pdfExportError: null,
        pdfPageWidth: 297,
        pdfPageHeight: 297,
        pdfPageUnit: "mm",
        pdfFormatVersion: 1,
      });

      await managedGitService.retryPdfCommitExport("pdf-group-1");

      expect(sessionRouter.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "pdf_export", commitSha }),
        expect.any(Object),
      );
    },
  );

  it("does not duplicate a fresh export for the current commit and format", async () => {
    const commitSha = "e".repeat(40);
    gitStorageMock.listRefs.mockResolvedValue(new Map([["refs/heads/main", commitSha]]));
    prismaMock.sessionGroup.findUnique.mockResolvedValue({
      id: "pdf-group-1",
      kind: "pdf",
      organizationId: ORG,
      repoId: REPO,
      branch: "main",
      pdfExportStatus: "publishing",
      pdfExportKey: "pdf-exports/org-1/pdf-group-1/previous.pdf",
      pdfExportCommitSha: commitSha,
      pdfExportFormatVersion: 4,
      pdfFormatVersion: 4,
      pdfExportAttemptedAt: new Date(),
      repo: { defaultBranch: "main" },
    });

    await managedGitService.retryPdfCommitExport("pdf-group-1");

    expect(prismaMock.sessionGroup.findMany).not.toHaveBeenCalled();
    expect(sessionRouter.send).not.toHaveBeenCalled();
  });

  it("ignores a superseded result and removes its uploaded object", async () => {
    prismaMock.sessionGroup.findFirst.mockResolvedValue(null);
    const { storage } = await import("../lib/storage/index.js");

    await managedGitService.completePdfExport({
      organizationId: ORG,
      sessionGroupId: "pdf-group-1",
      commitSha: "d".repeat(40),
      requestId: "old-request",
      storageKey: "pdf-exports/org-1/pdf-group-1/old-request.pdf",
    });

    expect(storage.deleteObject).toHaveBeenCalledWith(
      "pdf-exports/org-1/pdf-group-1/old-request.pdf",
    );
  });

  it("atomically promotes a completed export and removes the previous artifact", async () => {
    const storageKey = "pdf-exports/org-1/pdf-group-1/new.pdf";
    const previousKey = "pdf-exports/org-1/pdf-group-1/previous.pdf";
    prismaMock.sessionGroup.findFirst.mockResolvedValue({
      pdfExportPendingKey: storageKey,
      pdfExportKey: previousKey,
    });
    prismaMock.sessionGroup.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sessionGroup.findUniqueOrThrow.mockResolvedValue({
      id: "pdf-group-1",
      pdfExportStatus: "captured",
      pdfExportCommitSha: "f".repeat(40),
      pdfExportCapturedAt: new Date(),
      pdfExportError: null,
      pdfPageWidth: 210,
      pdfPageHeight: 297,
      pdfPageUnit: "mm",
      pdfFormatVersion: 1,
    });
    const { storage } = await import("../lib/storage/index.js");

    await managedGitService.completePdfExport({
      organizationId: ORG,
      sessionGroupId: "pdf-group-1",
      commitSha: "f".repeat(40),
      requestId: "current-request",
      storageKey,
    });

    expect(prismaMock.sessionGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pdfExportPendingKey: storageKey }),
        data: expect.objectContaining({
          pdfExportStatus: "captured",
          pdfExportKey: storageKey,
          pdfExportPendingKey: null,
        }),
      }),
    );
    expect(storage.deleteObject).toHaveBeenCalledWith(previousKey);
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "pdf_export_updated",
        payload: expect.objectContaining({
          sessionGroupId: "pdf-group-1",
          pdfExportStatus: "captured",
        }),
      }),
    );
  });

  it("removes an uploaded object when completion loses a concurrent update", async () => {
    const storageKey = "pdf-exports/org-1/pdf-group-1/raced-request.pdf";
    prismaMock.sessionGroup.findFirst.mockResolvedValue({
      pdfExportPendingKey: storageKey,
      pdfExportKey: null,
    });
    prismaMock.sessionGroup.updateMany.mockResolvedValue({ count: 0 });
    const { storage } = await import("../lib/storage/index.js");

    await managedGitService.completePdfExport({
      organizationId: ORG,
      sessionGroupId: "pdf-group-1",
      commitSha: "f".repeat(40),
      requestId: "raced-request",
      storageKey,
    });

    expect(storage.deleteObject).toHaveBeenCalledWith(storageKey);
  });
});
