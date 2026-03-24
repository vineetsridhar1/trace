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
import { resolveGitPath } from "@trace/shared/git-hooks";

const execFileAsync = promisify(execFile);

export interface QueuedGitHookCheckpoint {
  sessionId: string;
  checkpoint: GitCheckpointBridgePayload;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function buildGitCommitMessageArgs(ref: string): string[] {
  return ["show", "-s", "--format=%B", ref];
}

function parseCheckpointContext(raw: unknown): GitCheckpointContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const context = raw as Record<string, unknown>;
  if (
    typeof context.checkpointContextId !== "string"
    || typeof context.sessionId !== "string"
    || typeof context.sessionGroupId !== "string"
    || typeof context.repoId !== "string"
    || typeof context.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    checkpointContextId: context.checkpointContextId,
    promptEventId:
      typeof context.promptEventId === "string"
        ? context.promptEventId
        : null,
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
  if (!entry.checkpoint || typeof entry.checkpoint !== "object" || Array.isArray(entry.checkpoint)) {
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

export function getHookQueuePath(): string {
  return path.join(getTraceHomeDir(), "desktop-hooks", "pending-checkpoints.jsonl");
}

export function getHookRunnerWrapperPath(): string {
  return path.join(getTraceHomeDir(), "bin", "trace-hooks");
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

  const wrapper = [
    "#!/bin/sh",
    "set -eu",
    "export ELECTRON_RUN_AS_NODE=1",
    `exec ${shellQuote(electronBinaryPath)} ${shellQuote(runnerScriptPath)} "$@"`,
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

export async function loadQueuedGitHookCheckpoints(): Promise<QueuedGitHookCheckpoint[]> {
  try {
    const raw = await fs.promises.readFile(getHookQueuePath(), "utf8");
    return raw
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
      .filter((entry): entry is QueuedGitHookCheckpoint => entry != null);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
}

export async function replaceQueuedGitHookCheckpoints(
  entries: QueuedGitHookCheckpoint[],
): Promise<void> {
  const queuePath = getHookQueuePath();

  if (entries.length === 0) {
    await fs.promises.rm(queuePath, { force: true });
    return;
  }

  await fs.promises.mkdir(path.dirname(queuePath), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.promises.writeFile(queuePath, `${content}\n`, "utf8");
}

export async function queueGitHookCheckpoint(entry: QueuedGitHookCheckpoint): Promise<void> {
  const queuePath = getHookQueuePath();
  await fs.promises.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.promises.appendFile(queuePath, `${JSON.stringify(entry)}\n`, "utf8");
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

  for (const rewrite of rewrites) {
    const checkpoint = await inspectGitCheckpointForRef(cwd, rewrite.newCommitSha, {
      trigger: "rewrite",
      command: `git post-rewrite ${rewriteType}`,
      hookName: "post-rewrite",
      rewrittenFromCommitSha: rewrite.oldCommitSha,
      context,
    });

    await queueGitHookCheckpoint({
      sessionId: context.sessionId,
      checkpoint,
    });
  }
}
