import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const SOURCES_ROOT = process.env.TRACE_SOURCES_DIR ?? "/sources";

async function chmodTreeWithoutFollowingSymlinks(root: string, writable: boolean): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await chmodTreeWithoutFollowingSymlinks(entryPath, writable);
    const current = await fs.stat(entryPath);
    const mode = writable ? current.mode | 0o200 : current.mode & ~0o222;
    await fs.chmod(entryPath, mode);
  }
  const current = await fs.stat(root);
  await fs.chmod(root, writable ? current.mode | 0o200 : current.mode & ~0o222);
}

// Audit the exposed source subtree for symlinks that resolve outside the
// checkout. Such links could leak container/host files (secrets, other
// sessions' sources) into the design system, so they are rejected; symlinks
// that stay within the checked-out repo are safe and allowed. Symlinked
// directories are not descended into — their real target is already covered by
// normal recursion, and following them risks loops or escapes.
async function rejectEscapingSymlinks(scanRoot: string, realCheckoutRoot: string): Promise<void> {
  const entries = await fs.readdir(scanRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const entryPath = path.join(scanRoot, entry.name);
    if (entry.isSymbolicLink()) {
      let target: string;
      try {
        target = await fs.realpath(entryPath);
      } catch {
        // Dangling/unresolvable link — we cannot prove it stays inside the
        // checkout, so treat it as an escape.
        throw new Error("Source checkout contains a symbolic link that escapes the repository");
      }
      if (target !== realCheckoutRoot && !target.startsWith(realCheckoutRoot + path.sep))
        throw new Error("Source checkout contains a symbolic link that escapes the repository");
      continue;
    }
    if (entry.isDirectory()) await rejectEscapingSymlinks(entryPath, realCheckoutRoot);
  }
}
export type SourceRepositoryDescriptor = {
  repoId: string;
  remoteUrl: string;
  branch: string;
  sourcePath?: string;
  commitSha?: string;
};
export async function prepareReadOnlySourceCheckout(
  sessionGroupId: string,
  descriptor: SourceRepositoryDescriptor,
  sourcesRoot = SOURCES_ROOT,
): Promise<{ sourceWorkdir: string; commitSha: string }> {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionGroupId) || !/^[A-Za-z0-9_-]+$/.test(descriptor.repoId))
    throw new Error("Invalid source checkout identity");
  if (!descriptor.branch || descriptor.branch.startsWith("-") || descriptor.branch.includes(".."))
    throw new Error("Invalid source branch");
  if (descriptor.commitSha && !/^[a-f0-9]{40,64}$/i.test(descriptor.commitSha))
    throw new Error("Invalid source commit");
  const root = path.resolve(sourcesRoot, sessionGroupId);
  if (!root.startsWith(path.resolve(sourcesRoot) + path.sep))
    throw new Error("Source checkout escaped its root");
  await fs.mkdir(sourcesRoot, { recursive: true });
  const exists = await fs
    .stat(path.join(root, ".git"))
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await fs.rm(root, { recursive: true, force: true });
    await execFileAsync(
      "git",
      ["clone", "--depth", "1", "--branch", descriptor.branch, "--", descriptor.remoteUrl, root],
      { maxBuffer: 2 * 1024 * 1024 },
    );
  } else {
    await chmodTreeWithoutFollowingSymlinks(root, true);
    await execFileAsync("git", ["remote", "set-url", "origin", descriptor.remoteUrl], {
      cwd: root,
    });
    await execFileAsync("git", ["fetch", "--depth", "1", "origin", descriptor.branch], {
      cwd: root,
      maxBuffer: 2 * 1024 * 1024,
    });
    await execFileAsync("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: root });
    await execFileAsync("git", ["clean", "-ffd"], { cwd: root });
  }
  if (descriptor.commitSha) {
    await execFileAsync("git", ["fetch", "--depth", "1", "origin", descriptor.commitSha], {
      cwd: root,
      maxBuffer: 2 * 1024 * 1024,
    });
    await execFileAsync("git", ["checkout", "--detach", descriptor.commitSha], { cwd: root });
  } else {
    await execFileAsync("git", ["checkout", "--detach", "HEAD"], { cwd: root });
  }
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  if (descriptor.commitSha && stdout.trim() !== descriptor.commitSha)
    throw new Error("Source checkout did not resolve the pinned commit");
  const realRoot = await fs.realpath(root);
  const sourceWorkdir = descriptor.sourcePath ? path.resolve(root, descriptor.sourcePath) : root;
  if (sourceWorkdir !== root && !sourceWorkdir.startsWith(root + path.sep))
    throw new Error("Source subdirectory escaped checkout");
  if (!(await fs.stat(sourceWorkdir)).isDirectory())
    throw new Error("Source subdirectory does not exist");
  const realSourceWorkdir = await fs.realpath(sourceWorkdir);
  if (realSourceWorkdir !== realRoot && !realSourceWorkdir.startsWith(realRoot + path.sep))
    throw new Error("Source subdirectory escaped checkout");
  // Only the sourcePath subtree is exposed to the agent, so limit the symlink
  // audit to it — symlinks elsewhere in the repo (e.g. .claude/.agents config)
  // are never read and must not fail an unrelated design system.
  await rejectEscapingSymlinks(realSourceWorkdir, realRoot);
  await chmodTreeWithoutFollowingSymlinks(root, false);
  return { sourceWorkdir, commitSha: stdout.trim() };
}
