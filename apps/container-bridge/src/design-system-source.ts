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

async function rejectWorkingTreeSymlinks(root: string): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Source checkout contains a symbolic link");
    if (entry.isDirectory()) await rejectWorkingTreeSymlinks(entryPath);
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
  await rejectWorkingTreeSymlinks(root);
  const realRoot = await fs.realpath(root);
  const sourceWorkdir = descriptor.sourcePath ? path.resolve(root, descriptor.sourcePath) : root;
  if (sourceWorkdir !== root && !sourceWorkdir.startsWith(root + path.sep))
    throw new Error("Source subdirectory escaped checkout");
  if (!(await fs.stat(sourceWorkdir)).isDirectory())
    throw new Error("Source subdirectory does not exist");
  const realSourceWorkdir = await fs.realpath(sourceWorkdir);
  if (realSourceWorkdir !== realRoot && !realSourceWorkdir.startsWith(realRoot + path.sep))
    throw new Error("Source subdirectory escaped checkout");
  await chmodTreeWithoutFollowingSymlinks(root, false);
  return { sourceWorkdir, commitSha: stdout.trim() };
}
