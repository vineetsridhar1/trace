import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { describe, expect, it } from "vitest";
import { getUsedSlugs } from "@trace/shared/animal-names";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createRemoteRepoFixture(): Promise<{
  clonePath: string;
  sessionsDir: string;
}> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-animal-names-"));
  const remotePath = path.join(rootDir, "remote.git");
  const seedPath = path.join(rootDir, "seed");
  const clonePath = path.join(rootDir, "clone");
  const sessionsDir = path.join(rootDir, "sessions");

  await git(rootDir, ["init", "--bare", remotePath]);

  fs.mkdirSync(seedPath, { recursive: true });
  await git(seedPath, ["init", "-b", "main"]);
  await git(seedPath, ["config", "user.name", "Trace Test"]);
  await git(seedPath, ["config", "user.email", "trace@example.com"]);

  fs.writeFileSync(path.join(seedPath, "app.txt"), "base\n");
  await git(seedPath, ["add", "app.txt"]);
  await git(seedPath, ["commit", "-m", "initial commit"]);
  await git(seedPath, ["remote", "add", "origin", remotePath]);
  await git(seedPath, ["push", "-u", "origin", "main"]);
  await git(seedPath, ["checkout", "-b", "trace/heron"]);
  await git(seedPath, ["push", "-u", "origin", "trace/heron"]);

  await git(rootDir, ["clone", remotePath, clonePath]);
  fs.mkdirSync(path.join(sessionsDir, "otter"), { recursive: true });

  return { clonePath, sessionsDir };
}

describe("getUsedSlugs", () => {
  it("includes origin-backed trace branches in the used slug set", async () => {
    const { clonePath, sessionsDir } = await createRemoteRepoFixture();

    const usedSlugs = await getUsedSlugs(sessionsDir, clonePath);

    expect(usedSlugs.has("heron")).toBe(true);
    expect(usedSlugs.has("otter")).toBe(true);
  }, 15_000);
});
