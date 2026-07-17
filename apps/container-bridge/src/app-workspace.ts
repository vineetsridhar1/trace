import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { promisify } from "util";
import { assertValidCommitSha } from "@trace/shared";
import { generateAnimalSlug } from "@trace/shared/animal-names";

const execFileAsync = promisify(execFile);
const WORKSPACES_DIR = process.env.TRACE_WORKSPACES_DIR ?? "/workspaces";
const IMAGE_APP_STARTER_DIR = "/opt/trace/app-starter";
const SOURCE_APP_STARTER_DIR = fileURLToPath(new URL("../app-starter", import.meta.url));
const IMAGE_DESIGN_STARTER_DIR = "/opt/trace/design-starter";
const SOURCE_DESIGN_STARTER_DIR = fileURLToPath(new URL("../design-starter", import.meta.url));

export type GeneratedProjectKind = "app" | "design";

function starterDir(kind: GeneratedProjectKind): string {
  const configured =
    kind === "design" ? process.env.TRACE_DESIGN_STARTER_DIR : process.env.TRACE_APP_STARTER_DIR;
  if (configured) return configured;
  const imageDir = kind === "design" ? IMAGE_DESIGN_STARTER_DIR : IMAGE_APP_STARTER_DIR;
  const sourceDir = kind === "design" ? SOURCE_DESIGN_STARTER_DIR : SOURCE_APP_STARTER_DIR;
  if (fs.existsSync(imageDir)) return imageDir;
  if (fs.existsSync(sourceDir)) return sourceDir;
  throw new Error(`Trace ${kind} starter is missing from the runtime`);
}

// Remove a standalone generated-project workspace directory (created by createAppWorkspace).
// Takes the actual workdir path (the server persists it as session.workdir and
// sends it on delete; the bridge also tracks it in sessionWorkdirs) so we delete
// the real slug directory rather than guessing from the sessionGroupId. Only a
// direct child of WORKSPACES_DIR is removed — this guards traversal and rejects
// worktree paths (/repos/...) so it is safe to call for any session. Async so
// the recursive delete of node_modules never blocks the bridge event loop.
export async function removeAppWorkspace(workdir: string): Promise<void> {
  if (!workdir) return;
  const resolved = path.resolve(workdir);
  if (path.dirname(resolved) !== path.resolve(WORKSPACES_DIR)) return;
  await fs.promises.rm(resolved, { recursive: true, force: true });
}

export async function createAppWorkspace({
  sessionId: _sessionId,
  sessionGroupId,
  slug,
  repoRemoteUrl,
  defaultBranch,
  checkpointSha,
  sessionGroupKind = "app",
}: {
  sessionId: string;
  sessionGroupId?: string;
  slug?: string;
  repoRemoteUrl: string;
  defaultBranch: string;
  checkpointSha?: string;
  sessionGroupKind?: GeneratedProjectKind;
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
    fs.cpSync(starterDir(sessionGroupKind), workdir, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (source) => !source.includes("/node_modules/") && !source.endsWith("/node_modules"),
    });
  }

  if (!fs.existsSync(`${workdir}/.git`)) {
    await execFileAsync("git", ["init", "-b", defaultBranch], { cwd: workdir });
  }
  const agentLabel = sessionGroupKind === "design" ? "Design" : "App";
  await execFileAsync("git", ["config", "user.name", `Trace ${agentLabel} Agent`], {
    cwd: workdir,
  });
  await execFileAsync("git", ["config", "user.email", `${sessionGroupKind}-agent@trace.local`], {
    cwd: workdir,
  });
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

  if (checkpointSha) {
    // A recreated cloud runtime restores the last managed checkpoint first.
    // The remote may have advanced since that checkpoint, so fast-forward
    // before the agent starts. `--ff-only` keeps an unpublished checkpoint
    // intact instead of silently merging or overwriting it.
    await execFileAsync("git", ["pull", "--ff-only", "origin", defaultBranch], {
      cwd: workdir,
    });
  }

  return { workdir, slug: workspaceSlug };
}
