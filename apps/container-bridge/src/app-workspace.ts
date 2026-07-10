import { execFile } from "child_process";
import fs from "fs";
import { fileURLToPath } from "node:url";
import { promisify } from "util";
import { assertValidCommitSha } from "@trace/shared";
import { generateAnimalSlug } from "@trace/shared/animal-names";

const execFileAsync = promisify(execFile);
const WORKSPACES_DIR = process.env.TRACE_WORKSPACES_DIR ?? "/workspaces";
const IMAGE_APP_STARTER_DIR = "/opt/trace/app-starter";
const SOURCE_APP_STARTER_DIR = fileURLToPath(new URL("../app-starter", import.meta.url));

function appStarterDir(): string {
  const configured = process.env.TRACE_APP_STARTER_DIR;
  if (configured) return configured;
  if (fs.existsSync(IMAGE_APP_STARTER_DIR)) return IMAGE_APP_STARTER_DIR;
  if (fs.existsSync(SOURCE_APP_STARTER_DIR)) return SOURCE_APP_STARTER_DIR;
  throw new Error("Trace app starter is missing from the runtime");
}

// Remove a standalone app workspace directory (created by createAppWorkspace).
// The slug defaults to the sessionGroupId. Guarded to stay under WORKSPACES_DIR.
export function removeAppWorkspace(slug: string): void {
  if (!slug || slug.includes("/") || slug.includes("..")) return;
  const workdir = `${WORKSPACES_DIR}/${slug}`;
  fs.rmSync(workdir, { recursive: true, force: true });
}

export async function createAppWorkspace({
  sessionId: _sessionId,
  sessionGroupId,
  slug,
  repoRemoteUrl,
  defaultBranch,
  checkpointSha,
}: {
  sessionId: string;
  sessionGroupId?: string;
  slug?: string;
  repoRemoteUrl: string;
  defaultBranch: string;
  checkpointSha?: string;
}): Promise<{ workdir: string; slug: string }> {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  const usedSlugs = new Set(
    fs
      .readdirSync(WORKSPACES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  const workspaceSlug = slug ?? sessionGroupId ?? generateAnimalSlug(usedSlugs);
  const workdir = `${WORKSPACES_DIR}/${workspaceSlug}`;

  if (!fs.existsSync(workdir) && checkpointSha) {
    assertValidCommitSha(checkpointSha);
    await execFileAsync("git", ["clone", "--no-checkout", repoRemoteUrl, workdir]);
    await execFileAsync("git", ["checkout", "-B", defaultBranch, checkpointSha], { cwd: workdir });
  } else if (!fs.existsSync(workdir)) {
    fs.mkdirSync(workdir, { recursive: true });
    fs.cpSync(appStarterDir(), workdir, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (source) => !source.includes("/node_modules/") && !source.endsWith("/node_modules"),
    });
  }

  if (!fs.existsSync(`${workdir}/.git`)) {
    await execFileAsync("git", ["init", "-b", defaultBranch], { cwd: workdir });
  }
  await execFileAsync("git", ["config", "user.name", "Trace App Agent"], { cwd: workdir });
  await execFileAsync("git", ["config", "user.email", "app-agent@trace.local"], { cwd: workdir });
  const hasOrigin = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: workdir })
    .then(() => true)
    .catch(() => false);
  await execFileAsync(
    "git",
    hasOrigin
      ? ["remote", "set-url", "origin", repoRemoteUrl]
      : ["remote", "add", "origin", repoRemoteUrl],
    { cwd: workdir },
  );

  return { workdir, slug: workspaceSlug };
}
