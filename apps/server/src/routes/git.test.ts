import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm } from "fs/promises";
import { createServer, type Server } from "http";
import os from "os";
import path from "path";
import { promisify } from "util";
import express from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Point managed git storage at a throwaway temp dir and give the router a real
// LocalGitStorageAdapter (real `git init --bare`) so the round-trip exercises
// actual git, not a stub.
vi.mock("../lib/git-storage/index.js", async () => {
  const { LocalGitStorageAdapter, isSafeStorageId, assertSafeStorageId } = await import(
    "../lib/git-storage/local-adapter.js"
  );
  const root = path.join(os.tmpdir(), `trace-git-test-${randomUUID()}`);
  return {
    gitStorage: new LocalGitStorageAdapter(root),
    LocalGitStorageAdapter,
    isSafeStorageId,
    assertSafeStorageId,
  };
});

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../services/event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({}) },
}));

import { gitRouter } from "./git.js";
import { gitStorage } from "../lib/git-storage/index.js";
import { LocalGitStorageAdapter } from "../lib/git-storage/local-adapter.js";
import { managedGitService } from "../services/managed-git.js";
import { eventService } from "../services/event.js";
import { prisma } from "../lib/db.js";
import { createPrismaMock } from "../../test/helpers.js";

const execFileAsync = promisify(execFile);
const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const createEventMock = eventService.create as unknown as ReturnType<typeof vi.fn>;

const ORG = "orgrt";
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

let server: Server;
let baseUrl: string;
let tmpDirs: string[] = [];

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "user.email=t@t.test", "-c", "user.name=Trace", "-c", "credential.helper=", ...args],
    { cwd, env: GIT_ENV },
  );
  return stdout;
}

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function markManagedRepo(repoId: string): void {
  prismaMock.repo.findFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
    if (args?.where?.id === repoId) {
      return {
        id: repoId,
        organizationId: ORG,
        provider: "managed",
        defaultBranch: "main",
        name: "managed",
        remoteUrl: null,
      };
    }
    return null;
  });
}

function authUrl(repoId: string, capabilities: ("read" | "write")[]): string {
  const { token } = managedGitService.mintAccessToken({
    organizationId: ORG,
    repoId,
    scope: "runtime",
    subject: "runtime-1",
    capabilities,
  });
  const u = new URL(baseUrl);
  return `http://trace:${token}@${u.host}/git/${ORG}/${repoId}.git`;
}

beforeAll(async () => {
  const app = express();
  app.use("/git", gitRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm((gitStorage as LocalGitStorageAdapter).rootDir, { recursive: true, force: true });
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("managed git smart-HTTP round-trip", () => {
  it("clones, pushes, and fetches through smart HTTP and records the push", async () => {
    const repoId = randomUUID();
    markManagedRepo(repoId);
    await gitStorage.initBareRepo(ORG, repoId);
    const url = authUrl(repoId, ["read", "write"]);

    // Author a commit locally and push it to the managed remote.
    const work = await tmp("trace-git-work-");
    await git(["init", "-b", "main"], work);
    await execFileAsync("bash", ["-c", "echo hello > file.txt"], { cwd: work });
    await git(["add", "."], work);
    await git(["commit", "-m", "initial"], work);
    await git(["push", url, "HEAD:refs/heads/main"], work);

    // Clone from the managed remote into a fresh dir and verify content survived.
    const cloneDir = await tmp("trace-git-clone-");
    await git(["clone", url, cloneDir], path.dirname(cloneDir));
    const content = await readFile(path.join(cloneDir, "file.txt"), "utf8");
    expect(content.trim()).toBe("hello");

    // Fetch after a second push (proves incremental fetch, not just initial clone).
    await execFileAsync("bash", ["-c", "echo more >> file.txt"], { cwd: work });
    await git(["commit", "-am", "second"], work);
    await git(["push", url, "HEAD:refs/heads/main"], work);
    await git(["fetch", "origin"], cloneDir);
    const log = await git(["log", "--oneline", "origin/main"], cloneDir);
    expect(log).toContain("second");

    // The receive-pack post-hook emitted a repo_updated event for the ref.
    const pushEvents = createEventMock.mock.calls.filter(
      (call) => call[0]?.eventType === "repo_updated",
    );
    expect(pushEvents.length).toBeGreaterThanOrEqual(1);
    expect(pushEvents[0][0].payload.refs[0].ref).toBe("refs/heads/main");
  });
});

describe("managed git auth", () => {
  it("challenges unauthenticated info/refs with 401", async () => {
    const repoId = randomUUID();
    markManagedRepo(repoId);
    const res = await fetch(`${baseUrl}/git/${ORG}/${repoId}.git/info/refs?service=git-upload-pack`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  it("serves the advertisement for a valid read token", async () => {
    const repoId = randomUUID();
    markManagedRepo(repoId);
    await gitStorage.initBareRepo(ORG, repoId);
    const { token } = managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId,
      scope: "user",
      subject: "user-1",
      capabilities: ["read"],
    });
    const res = await fetch(
      `${baseUrl}/git/${ORG}/${repoId}.git/info/refs?service=git-upload-pack`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-git-upload-pack-advertisement");
    const body = await res.text();
    expect(body.startsWith("001e# service=git-upload-pack\n0000")).toBe(true);
  });

  it("rejects a read-only token attempting to push with 403", async () => {
    const repoId = randomUUID();
    markManagedRepo(repoId);
    await gitStorage.initBareRepo(ORG, repoId);
    const { token } = managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId,
      scope: "user",
      subject: "user-1",
      capabilities: ["read"],
    });
    const res = await fetch(`${baseUrl}/git/${ORG}/${repoId}.git/git-receive-pack`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-git-receive-pack-request",
      },
      body: "0000",
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a repo that is not a managed repo", async () => {
    prismaMock.repo.findFirst.mockResolvedValue(null);
    const { token } = managedGitService.mintAccessToken({
      organizationId: ORG,
      repoId: "missing",
      scope: "user",
      subject: "user-1",
      capabilities: ["read"],
    });
    const res = await fetch(
      `${baseUrl}/git/${ORG}/missing.git/info/refs?service=git-upload-pack`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(404);
  });
});
