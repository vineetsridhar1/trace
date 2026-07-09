import { execFile } from "child_process";
import express from "express";
import fs from "fs";
import { createServer, type Server } from "http";
import os from "os";
import path from "path";
import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
  },
}));

import { prisma } from "../lib/db.js";
import { managedGitRouter } from "../routes/managed-git.js";
import { eventService } from "./event.js";
import { managedGitService } from "./managed-git.js";

const execFileAsync = promisify(execFile);
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  return address.port;
}

async function closeServer(server: Server | null): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("managed git smart HTTP", () => {
  let tempDir = "";
  let server: Server | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-managed-git-"));
    vi.stubEnv("GIT_STORAGE_ROOT", path.join(tempDir, "git-storage"));

    prismaMock.repo.findFirst.mockImplementation(async () => ({
      id: "repo-1",
      name: "Managed app",
      remoteUrl: process.env.TRACE_SERVER_PUBLIC_URL
        ? `${process.env.TRACE_SERVER_PUBLIC_URL}/git/org-1/repo-1.git`
        : null,
    }));
    prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "user-1" });
  });

  afterEach(async () => {
    await closeServer(server);
    server = null;
    vi.unstubAllEnvs();
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("clones, pushes, fetches, and records push events through smart HTTP", async () => {
    await managedGitService.prepareBareRepo("repo-1");

    const app = express();
    app.use(
      "/git",
      express.raw({
        type: ["application/x-git-upload-pack-request", "application/x-git-receive-pack-request"],
        limit: "100mb",
      }),
      managedGitRouter,
    );
    server = createServer(app);
    const port = await listen(server);
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", `http://127.0.0.1:${port}`);

    const credential = await managedGitService.createUserCloneCredential({
      organizationId: "org-1",
      repoId: "repo-1",
      userId: "user-1",
    });
    const cloneDir = path.join(tempDir, "clone");
    await execFileAsync("git", ["clone", credential.credentialedRemoteUrl, cloneDir]);
    await execFileAsync("git", ["checkout", "-b", "main"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.email", "trace@example.test"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Trace Test"], { cwd: cloneDir });
    await fs.promises.writeFile(path.join(cloneDir, "README.md"), "managed git smoke\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: cloneDir });
    await execFileAsync("git", ["commit", "-m", "managed git smoke"], { cwd: cloneDir });
    await execFileAsync("git", ["push", "origin", "main"], { cwd: cloneDir });

    const fetchDir = path.join(tempDir, "fetch");
    await execFileAsync("git", ["clone", credential.credentialedRemoteUrl, fetchDir]);
    const fetched = await fs.promises.readFile(path.join(fetchDir, "README.md"), "utf8");
    expect(fetched).toBe("managed git smoke\n");

    await vi.waitFor(() => {
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "repo_branch_pushed",
          scopeId: "repo-1",
          payload: expect.objectContaining({
            repoId: "repo-1",
            sessionId: null,
            heads: expect.arrayContaining([
              expect.objectContaining({
                ref: "refs/heads/main",
                branch: "main",
                commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
              }),
            ]),
          }),
          actorId: "user-1",
        }),
      );
    });
  }, 30_000);
});
