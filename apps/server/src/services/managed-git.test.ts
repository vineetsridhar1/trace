import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import type { Request, Response } from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import { PassThrough } from "stream";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

const spawnMock = vi.hoisted(() => vi.fn());
const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({
  spawn: spawnMock,
  execFile: execFileMock,
}));

import { prisma } from "../lib/db.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { eventService } from "./event.js";
import { managedGitService } from "./managed-git.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };
type MockGitResponse = PassThrough & {
  status: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function makeGitResponse(): MockGitResponse {
  const stream = new PassThrough() as MockGitResponse;
  stream.status = vi.fn().mockReturnValue(stream);
  stream.set = vi.fn().mockReturnValue(stream);
  stream.type = vi.fn().mockReturnValue(stream);
  stream.json = vi.fn().mockReturnValue(stream);
  return stream;
}

function basicAuth(token: string): string {
  return `Basic ${Buffer.from(`x-token:${token}`, "utf8").toString("base64")}`;
}

function mockGitSpawnSuccess(output = "001e# service=git-upload-pack\n0000") {
  spawnMock.mockImplementationOnce(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    process.nextTick(() => {
      child.stdout.end(output);
      child.emit("close", 0);
    });
    return child;
  });
}

describe("managedGitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example");
    vi.spyOn(managedGitService, "prepareBareRepo").mockResolvedValue("/tmp/repo.git");
    execFileMock.mockImplementation((_command, _args, callback) => {
      if (typeof callback === "function") callback(null, "", "");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("creates app repos with a starter application config", async () => {
    prismaMock.repo.create.mockResolvedValueOnce({ id: "repo-1" });

    const repo = await managedGitService.createAppRepo({
      organizationId: "org-1",
      name: "Customer Portal",
    });

    expect(repo.name).toBe("Customer Portal");
    expect(repo.remoteUrl).toMatch(/^https:\/\/trace\.example\/git\/org-1\/.+\.git$/);
    expect(prismaMock.repo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        name: "Customer Portal",
        provider: "managed",
        defaultBranch: "main",
        setupConfig: expect.objectContaining({
          appStarter: expect.objectContaining({
            framework: "nextjs",
            packageManager: "pnpm",
          }),
          applications: expect.objectContaining({
            setupScripts: expect.arrayContaining([
              expect.objectContaining({ id: "install", command: "pnpm install" }),
              expect.objectContaining({ id: "build", command: "pnpm build" }),
            ]),
            applications: expect.arrayContaining([
              expect.objectContaining({
                id: "web",
                processes: expect.arrayContaining([
                  expect.objectContaining({
                    id: "dev",
                    command: "pnpm dev --hostname 0.0.0.0",
                    ports: expect.arrayContaining([
                      expect.objectContaining({
                        port: 3000,
                        defaultForwardingEnabled: true,
                      }),
                    ]),
                  }),
                ]),
              }),
            ]),
          }),
        }),
      }),
    });
  });

  it("records managed repo push events with branch heads", async () => {
    await managedGitService.recordManagedRepoPush({
      organizationId: "org-1",
      repoId: "repo-1",
      sessionId: "session-1",
      heads: [
        {
          ref: "refs/heads/main",
          branch: "main",
          commitSha: "0123456789abcdef0123456789abcdef01234567",
        },
      ],
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "repo-1",
      eventType: "repo_branch_pushed",
      payload: {
        repoId: "repo-1",
        sessionId: "session-1",
        heads: [
          {
            ref: "refs/heads/main",
            branch: "main",
            commitSha: "0123456789abcdef0123456789abcdef01234567",
          },
        ],
      },
      actorType: "system",
      actorId: "managed-git",
    });
  });

  it("creates short-lived user credentials for managed repos", async () => {
    prismaMock.repo.findFirst.mockResolvedValueOnce({
      id: "repo-1",
      name: "Managed app",
      remoteUrl: "https://trace.example/git/org-1/repo-1.git",
    });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({ userId: "user-1" });

    const credential = await managedGitService.createUserCloneCredential({
      organizationId: "org-1",
      repoId: "repo-1",
      userId: "user-1",
    });

    expect(credential.remoteUrl).toBe("https://trace.example/git/org-1/repo-1.git");
    expect(credential.credentialedRemoteUrl).toMatch(
      /^https:\/\/x-token:.+@trace\.example\/git\/org-1\/repo-1\.git$/,
    );
    expect(credential.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(jwt.verify(credential.token, resolveJwtSecret())).toMatchObject({
      tokenType: "managed_git_user",
      userId: "user-1",
      organizationId: "org-1",
      repoId: "repo-1",
    });
  });

  it("rejects managed git user credentials for non-members", async () => {
    prismaMock.repo.findFirst.mockResolvedValueOnce({
      id: "repo-1",
      name: "Managed app",
      remoteUrl: "https://trace.example/git/org-1/repo-1.git",
    });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce(null);

    await expect(
      managedGitService.createUserCloneCredential({
        organizationId: "org-1",
        repoId: "repo-1",
        userId: "user-2",
      }),
    ).rejects.toThrow("Not authorized for this managed repo.");
  });

  it("rejects managed git user credentials after repo storage is garbage-collected", async () => {
    prismaMock.repo.findFirst.mockResolvedValueOnce({
      id: "repo-1",
      name: "Managed app",
      remoteUrl: "https://trace.example/git/org-1/repo-1.git",
      setupConfig: { managedGitGarbageCollectedAt: "2026-07-01T00:00:00.000Z" },
    });

    await expect(
      managedGitService.createUserCloneCredential({
        organizationId: "org-1",
        repoId: "repo-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Managed repo storage has expired.");
    expect(prismaMock.orgMember.findUnique).not.toHaveBeenCalled();
  });

  it("garbage-collects archived app managed bare repos after the retention window", async () => {
    const rmSpy = vi.spyOn(fs.promises, "rm").mockResolvedValueOnce(undefined);
    prismaMock.repo.findMany.mockResolvedValueOnce([
      {
        id: "repo-archived",
        organizationId: "org-1",
        setupConfig: { appStarter: { framework: "nextjs" } },
        sessionGroups: [{ id: "group-archived" }],
      },
    ]);
    prismaMock.repo.update.mockResolvedValueOnce({ id: "repo-archived" });

    const count = await managedGitService.deleteExpiredArchivedAppRepos(30);

    expect(count).toBe(1);
    expect(prismaMock.repo.findMany).toHaveBeenCalledWith({
      where: {
        provider: "managed",
        sessionGroups: {
          some: {
            kind: "app",
            archivedAt: { lt: expect.any(Date) },
          },
          none: {
            archivedAt: null,
          },
        },
      },
      select: {
        id: true,
        organizationId: true,
        setupConfig: true,
        sessionGroups: {
          where: {
            kind: "app",
            archivedAt: { lt: expect.any(Date) },
          },
          select: { id: true },
        },
      },
    });
    expect(rmSpy).toHaveBeenCalledWith(expect.stringContaining("repo-archived.git"), {
      recursive: true,
      force: true,
    });
    expect(prismaMock.repo.update).toHaveBeenCalledWith({
      where: { id: "repo-archived" },
      data: {
        setupConfig: expect.objectContaining({
          appStarter: { framework: "nextjs" },
          managedGitGarbageCollectedAt: expect.any(String),
        }),
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "repo-archived",
      eventType: "repo_updated",
      payload: expect.objectContaining({
        repoId: "repo-archived",
        provider: "managed",
        managedGitGarbageCollectedAt: expect.any(String),
        sessionGroupIds: ["group-archived"],
      }),
      actorType: "system",
      actorId: "managed-git",
    });
  });

  it("skips managed repos whose bare storage was already garbage-collected", async () => {
    const rmSpy = vi.spyOn(fs.promises, "rm").mockResolvedValue(undefined);
    prismaMock.repo.findMany.mockResolvedValueOnce([
      {
        id: "repo-collected",
        organizationId: "org-1",
        setupConfig: { managedGitGarbageCollectedAt: "2026-07-01T00:00:00.000Z" },
        sessionGroups: [{ id: "group-archived" }],
      },
    ]);

    const count = await managedGitService.deleteExpiredArchivedAppRepos(30);

    expect(count).toBe(0);
    expect(rmSpy).not.toHaveBeenCalled();
    expect(prismaMock.repo.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("rejects smart HTTP access after repo storage is garbage-collected", async () => {
    const token = jwt.sign(
      {
        tokenType: "managed_git_user",
        userId: "user-1",
        organizationId: "org-1",
        repoId: "repo-1",
      },
      resolveJwtSecret(),
      { expiresIn: 60 },
    );
    prismaMock.repo.findFirst.mockResolvedValueOnce({
      id: "repo-1",
      setupConfig: { managedGitGarbageCollectedAt: "2026-07-01T00:00:00.000Z" },
    });
    const response = makeGitResponse();

    await managedGitService.handleInfoRefs(
      {
        query: { service: "git-upload-pack" },
        headers: { authorization: basicAuth(token) },
      } as unknown as Request,
      response as unknown as Response,
      { orgId: "org-1", repoId: "repo-1" },
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("authorizes smart HTTP info refs with user managed git credentials", async () => {
    prismaMock.repo.findFirst
      .mockResolvedValueOnce({
        id: "repo-1",
        name: "Managed app",
        remoteUrl: "https://trace.example/git/org-1/repo-1.git",
      })
      .mockResolvedValueOnce({ id: "repo-1" });
    prismaMock.orgMember.findUnique
      .mockResolvedValueOnce({ userId: "user-1" })
      .mockResolvedValueOnce({ userId: "user-1" });
    const credential = await managedGitService.createUserCloneCredential({
      organizationId: "org-1",
      repoId: "repo-1",
      userId: "user-1",
    });
    mockGitSpawnSuccess();
    const response = makeGitResponse();

    await managedGitService.handleInfoRefs(
      {
        query: { service: "git-upload-pack" },
        headers: { authorization: basicAuth(credential.token) },
      } as unknown as Request,
      response as unknown as Response,
      { orgId: "org-1", repoId: "repo-1" },
    );

    expect(response.type).toHaveBeenCalledWith("application/x-git-upload-pack-advertisement");
    expect(response.set).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(spawnMock).toHaveBeenCalledWith(
      "git",
      ["upload-pack", "--stateless-rpc", "--advertise-refs", expect.stringContaining("repo-1.git")],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  });
});
