import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { prepareReadOnlySourceCheckout } from "./design-system-source.js";
const exec = promisify(execFile);

describe("design-system source checkout", () => {
  it("clones a separate pinned, read-only source boundary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trace-source-"));
    const repo = path.join(root, "fixture");
    const sources = path.join(root, "sources");
    try {
      await mkdir(repo);
      await exec("git", ["init", "-b", "main"], { cwd: repo });
      await exec("git", ["config", "user.email", "fixture@trace.local"], { cwd: repo });
      await exec("git", ["config", "user.name", "Fixture"], { cwd: repo });
      await mkdir(path.join(repo, "packages/ui"), { recursive: true });
      await writeFile(path.join(repo, "packages/ui/tokens.css"), ":root{}");
      await exec("git", ["add", "."], { cwd: repo });
      await exec("git", ["commit", "-m", "fixture"], { cwd: repo });
      const result = await prepareReadOnlySourceCheckout(
        "group-1",
        { repoId: "repo-1", remoteUrl: repo, branch: "main", sourcePath: "packages/ui" },
        sources,
      );
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      await expect(access(path.join(result.sourceWorkdir, "tokens.css"))).resolves.toBeUndefined();
      await writeFile(path.join(repo, "packages/ui/tokens.css"), ":root{--accent:green}");
      await exec("git", ["add", "."], { cwd: repo });
      await exec("git", ["commit", "-m", "new source revision"], { cwd: repo });
      const restored = await prepareReadOnlySourceCheckout(
        "group-1",
        {
          repoId: "repo-1",
          remoteUrl: repo,
          branch: "main",
          sourcePath: "packages/ui",
          commitSha: result.commitSha,
        },
        sources,
      );
      expect(restored.commitSha).toBe(result.commitSha);
      expect(await readFile(path.join(restored.sourceWorkdir, "tokens.css"), "utf8")).toBe(
        ":root{}",
      );
    } finally {
      await exec("chmod", ["-R", "u+w", root]).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });
});
