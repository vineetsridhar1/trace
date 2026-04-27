import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { GitCheckpointBridgePayload, GitCheckpointContext } from "@trace/shared";
import {
  addTraceCheckpointTrailer,
  buildGitDiffTreeArgs,
  buildGitShowArgs,
  parseGitShowOutput,
  parseTraceCheckpointContextId,
} from "@trace/shared";
import { resolveGitPath, shellQuote, isNotFoundError } from "@trace/shared/git-hooks";

const execFileAsync = promisify(execFile);

export interface QueuedGitHookCheckpoint {
  sessionId: string;
  checkpoint: GitCheckpointBridgePayload;
}

function buildGitCommitMessageArgs(ref: string): string[] {
  return ["show", "-s", "--format=%B", ref];
}

function parseCheckpointContext(raw: unknown): GitCheckpointContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const context = raw as Record<string, unknown>;
  if (
    typeof context.checkpointContextId !== "string" ||
    typeof context.sessionId !== "string" ||
    typeof context.sessionGroupId !== "string" ||
    typeof context.repoId !== "string" ||
    typeof context.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    checkpointContextId: context.checkpointContextId,
    promptEventId: typeof context.promptEventId === "string" ? context.promptEventId : null,
    sessionId: context.sessionId,
    sessionGroupId: context.sessionGroupId,
    repoId: context.repoId,
    updatedAt: context.updatedAt,
  };
}

function parseQueuedCheckpoint(raw: unknown): QueuedGitHookCheckpoint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const entry = raw as Record<string, unknown>;
  if (typeof entry.sessionId !== "string") return null;
  if (
    !entry.checkpoint ||
    typeof entry.checkpoint !== "object" ||
    Array.isArray(entry.checkpoint)
  ) {
    return null;
  }

  return {
    sessionId: entry.sessionId,
    checkpoint: entry.checkpoint as GitCheckpointBridgePayload,
  };
}

export function getTraceHomeDir(): string {
  return path.join(os.homedir(), ".trace");
}

export function getHookQueueDir(): string {
  return path.join(getTraceHomeDir(), "desktop-hooks", "pending-checkpoints");
}

/** @deprecated kept for migration — remove after one release */
export function getLegacyHookQueuePath(): string {
  return path.join(getTraceHomeDir(), "desktop-hooks", "pending-checkpoints.jsonl");
}

export function getHookRunnerWrapperPath(): string {
  return path.join(getTraceHomeDir(), "bin", "trace-hooks");
}

/**
 * Resolve the runner script path, handling packaged Electron where
 * `__dirname` lives inside `app.asar`. Shell scripts cannot exec
 * into asar archives, so we replace `.asar/` with `.asar.unpacked/`.
 * The Electron build config must include `hook-runner.js` in
 * `asarUnpack` for this to work.
 */
function resolveRunnerScriptPath(rawPath: string): string {
  return rawPath.replace(/\.asar([/\\])/, ".asar.unpacked$1");
}

export function ensureHookRunnerEntrypoint({
  electronBinaryPath,
  runnerScriptPath,
}: {
  electronBinaryPath: string;
  runnerScriptPath: string;
}): string {
  const wrapperPath = getHookRunnerWrapperPath();
  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });

  const resolvedRunnerPath = resolveRunnerScriptPath(runnerScriptPath);

  const wrapper = [
    "#!/bin/sh",
    "set -eu",
    "export ELECTRON_RUN_AS_NODE=1",
    `exec ${shellQuote(electronBinaryPath)} ${shellQuote(resolvedRunnerPath)} "$@"`,
    "",
  ].join("\n");

  fs.writeFileSync(wrapperPath, wrapper, "utf8");
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

export async function readCheckpointContext(cwd: string): Promise<GitCheckpointContext | null> {
  try {
    const contextPath = await resolveGitPath(cwd, "trace/current-context.json");
    const raw = await fs.promises.readFile(contextPath, "utf8");
    return parseCheckpointContext(JSON.parse(raw));
  } catch (error) {
    if (isNotFoundError(error)) return null;
    return null;
  }
}

export async function writeCheckpointContext(
  cwd: string,
  context: GitCheckpointContext,
): Promise<void> {
  const contextPath = await resolveGitPath(cwd, "trace/current-context.json");
  await fs.promises.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.promises.writeFile(contextPath, JSON.stringify(context, null, 2), "utf8");
}

let legacyMigrationDone = false;

/**
 * Migrate the old single-file JSONL queue to per-file entries.
 * Runs at most once per process lifetime.
 */
async function migrateLegacyQueueOnce(): Promise<void> {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;

  const legacyPath = getLegacyHookQueuePath();
  try {
    const legacyContent = await fs.promises.readFile(legacyPath, "utf8");
    const legacyEntries = legacyContent
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return parseQueuedCheckpoint(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((e): e is QueuedGitHookCheckpoint => e != null);
    for (const entry of legacyEntries) {
      await queueGitHookCheckpoint(entry);
    }
    await fs.promises.rm(legacyPath, { force: true });
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.warn("[hook-runtime] failed to migrate legacy queue:", error);
    }
  }
}

/**
 * Load all queued checkpoint files from the per-file queue directory.
 * Returns entries paired with their file paths so callers can delete
 * individual entries after successful delivery.
 */
export async function loadQueuedGitHookCheckpoints(): Promise<
  Array<{ entry: QueuedGitHookCheckpoint; filePath: string }>
> {
  const queueDir = getHookQueueDir();

  await migrateLegacyQueueOnce();

  let files: string[];
  try {
    files = await fs.promises.readdir(queueDir);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }

  const results: Array<{ entry: QueuedGitHookCheckpoint; filePath: string }> = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(queueDir, file);
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      const entry = parseQueuedCheckpoint(JSON.parse(raw));
      if (entry) results.push({ entry, filePath });
    } catch {
      // Corrupt file — remove it
      await fs.promises.rm(filePath, { force: true }).catch(() => {});
    }
  }
  return results;
}

/**
 * Remove a single queued checkpoint file after successful delivery.
 */
export async function removeQueuedCheckpointFile(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true });
}

/**
 * Queue a checkpoint by writing an individual file.
 * Uses write-to-temp-then-rename for atomicity so concurrent hooks
 * cannot corrupt each other's writes.
 */
export async function queueGitHookCheckpoint(entry: QueuedGitHookCheckpoint): Promise<void> {
  const queueDir = getHookQueueDir();
  await fs.promises.mkdir(queueDir, { recursive: true });

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `${timestamp}-${random}.json`;
  const filePath = path.join(queueDir, fileName);
  const tmpPath = `${filePath}.tmp`;

  await fs.promises.writeFile(tmpPath, JSON.stringify(entry), "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

export async function prepareCommitMessageHook(
  cwd: string,
  messageFilePath: string,
): Promise<void> {
  const context = await readCheckpointContext(cwd);
  if (!context?.checkpointContextId) return;

  const current = await fs.promises.readFile(messageFilePath, "utf8");
  const next = addTraceCheckpointTrailer(current, context.checkpointContextId);
  if (next !== current) {
    await fs.promises.writeFile(messageFilePath, next, "utf8");
  }
}

export async function inspectGitCheckpointForRef(
  cwd: string,
  ref: string,
  options: {
    trigger: GitCheckpointBridgePayload["trigger"];
    command: string;
    hookName?: GitCheckpointBridgePayload["hookName"];
    rewrittenFromCommitSha?: string | null;
    context?: GitCheckpointContext | null;
  },
): Promise<GitCheckpointBridgePayload> {
  const [{ stdout: showStdout }, { stdout: diffStdout }, { stdout: bodyStdout }] =
    await Promise.all([
      execFileAsync("git", buildGitShowArgs(ref), { cwd, maxBuffer: 1024 * 1024 }),
      execFileAsync("git", buildGitDiffTreeArgs(ref), { cwd, maxBuffer: 5 * 1024 * 1024 }),
      execFileAsync("git", buildGitCommitMessageArgs(ref), { cwd, maxBuffer: 1024 * 1024 }),
    ]);

  const payload = parseGitShowOutput(
    showStdout,
    diffStdout,
    options.trigger,
    options.command,
    new Date().toISOString(),
  );
  const trailerContextId = parseTraceCheckpointContextId(bodyStdout);

  return {
    ...payload,
    source: "git_hook",
    hookName: options.hookName,
    checkpointContextId: trailerContextId ?? options.context?.checkpointContextId ?? null,
    promptEventId: options.context?.promptEventId ?? null,
    rewrittenFromCommitSha: options.rewrittenFromCommitSha ?? null,
  };
}

export async function postCommitHook(cwd: string): Promise<void> {
  const context = await readCheckpointContext(cwd);
  if (!context?.sessionId) return;

  const checkpoint = await inspectGitCheckpointForRef(cwd, "HEAD", {
    trigger: "commit",
    command: "git post-commit",
    hookName: "post-commit",
    context,
  });

  await queueGitHookCheckpoint({
    sessionId: context.sessionId,
    checkpoint,
  });
}

const POST_REWRITE_CONCURRENCY = 8;

export async function postRewriteHook(
  cwd: string,
  rewriteType: string,
  input: string,
): Promise<void> {
  const context = await readCheckpointContext(cwd);
  if (!context?.sessionId) return;

  const rewrites = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts): parts is [string, string] => parts.length >= 2)
    .map(([oldCommitSha, newCommitSha]) => ({ oldCommitSha, newCommitSha }));

  // Process rewrites in parallel batches to avoid blocking git on large rebases
  for (let i = 0; i < rewrites.length; i += POST_REWRITE_CONCURRENCY) {
    const batch = rewrites.slice(i, i + POST_REWRITE_CONCURRENCY);
    const checkpoints = await Promise.all(
      batch.map((rewrite) =>
        inspectGitCheckpointForRef(cwd, rewrite.newCommitSha, {
          trigger: "rewrite",
          command: `git post-rewrite ${rewriteType}`,
          hookName: "post-rewrite",
          rewrittenFromCommitSha: rewrite.oldCommitSha,
          context,
        }),
      ),
    );

    // Queue writes are still sequential per batch to avoid FS contention
    for (const checkpoint of checkpoints) {
      await queueGitHookCheckpoint({
        sessionId: context.sessionId,
        checkpoint,
      });
    }
  }
}
