import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

  it("rejects escaping repository symlinks before exposing the source checkout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trace-source-symlink-"));
    const repo = path.join(root, "fixture");
    const sources = path.join(root, "sources");
    try {
      await mkdir(repo);
      await exec("git", ["init", "-b", "main"], { cwd: repo });
      await exec("git", ["config", "user.email", "fixture@trace.local"], { cwd: repo });
      await exec("git", ["config", "user.name", "Fixture"], { cwd: repo });
      await writeFile(path.join(root, "outside.txt"), "secret");
      await symlink(path.join(root, "outside.txt"), path.join(repo, "escape.txt"));
      await exec("git", ["add", "."], { cwd: repo });
      await exec("git", ["commit", "-m", "symlink fixture"], { cwd: repo });

      await expect(
        prepareReadOnlySourceCheckout(
          "group-1",
          { repoId: "repo-1", remoteUrl: repo, branch: "main" },
          sources,
        ),
      ).rejects.toThrow("contains a symbolic link");
    } finally {
      await exec("chmod", ["-R", "u+w", root]).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows symlinks that resolve within the checkout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trace-source-internal-"));
    const repo = path.join(root, "fixture");
    const sources = path.join(root, "sources");
    try {
      await mkdir(repo);
      await exec("git", ["init", "-b", "main"], { cwd: repo });
      await exec("git", ["config", "user.email", "fixture@trace.local"], { cwd: repo });
      await exec("git", ["config", "user.name", "Fixture"], { cwd: repo });
      await writeFile(path.join(repo, "tokens.css"), ":root{}");
      // Relative symlink pointing to a sibling file inside the repo — safe.
      await symlink("tokens.css", path.join(repo, "alias.css"));
      await exec("git", ["add", "."], { cwd: repo });
      await exec("git", ["commit", "-m", "internal symlink fixture"], { cwd: repo });

      const result = await prepareReadOnlySourceCheckout(
        "group-1",
        { repoId: "repo-1", remoteUrl: repo, branch: "main" },
        sources,
      );
      await expect(access(path.join(result.sourceWorkdir, "alias.css"))).resolves.toBeUndefined();
    } finally {
      await exec("chmod", ["-R", "u+w", root]).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores symlinks outside the exposed sourcePath subtree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trace-source-scoped-"));
    const repo = path.join(root, "fixture");
    const sources = path.join(root, "sources");
    try {
      await mkdir(repo);
      await exec("git", ["init", "-b", "main"], { cwd: repo });
      await exec("git", ["config", "user.email", "fixture@trace.local"], { cwd: repo });
      await exec("git", ["config", "user.name", "Fixture"], { cwd: repo });
      await mkdir(path.join(repo, "packages/ui"), { recursive: true });
      await writeFile(path.join(repo, "packages/ui/tokens.css"), ":root{}");
      // An escaping symlink outside the design source subtree (mirrors real
      // repos with .claude/.agents config symlinks) must not fail the checkout.
      await writeFile(path.join(root, "outside.txt"), "secret");
      await symlink(path.join(root, "outside.txt"), path.join(repo, "escape.txt"));
      await exec("git", ["add", "."], { cwd: repo });
      await exec("git", ["commit", "-m", "scoped symlink fixture"], { cwd: repo });

      const result = await prepareReadOnlySourceCheckout(
        "group-1",
        { repoId: "repo-1", remoteUrl: repo, branch: "main", sourcePath: "packages/ui" },
        sources,
      );
      await expect(access(path.join(result.sourceWorkdir, "tokens.css"))).resolves.toBeUndefined();
    } finally {
      await exec("chmod", ["-R", "u+w", root]).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });
});
