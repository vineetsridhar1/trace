import { asJsonObject } from "./json.js";
import type { ToolOutput } from "./adapters/coding-tool.js";

export type GitCheckpointTrigger = "commit" | "push" | "commit_and_push" | "rewrite";

const GIT_SHOW_FORMAT = "%H%n%P%n%T%n%s%n%an <%ae>%n%cI";
const TRACE_CHECKPOINT_TRAILER_RE = /^Trace-Checkpoint:\s*(.+)\s*$/im;

export interface GitCheckpointContext {
  checkpointContextId: string;
  promptEventId?: string | null;
  sessionId: string;
  sessionGroupId: string;
  repoId: string;
  updatedAt: string;
}

export function buildGitShowArgs(ref: string = "HEAD"): string[] {
  return ["show", "-s", `--format=${GIT_SHOW_FORMAT}`, ref];
}

export function buildGitDiffTreeArgs(ref: string = "HEAD"): string[] {
  return ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", ref];
}

export const GIT_SHOW_ARGS = buildGitShowArgs();
export const GIT_DIFF_TREE_ARGS = buildGitDiffTreeArgs();
export const TRACE_CHECKPOINT_TRAILER = "Trace-Checkpoint";

export function parseGitShowOutput(
  showStdout: string,
  diffStdout: string,
  trigger: GitCheckpointTrigger,
  command: string,
  observedAt: string,
): GitCheckpointBridgePayload {
  const [commitSha = "", parents = "", treeSha = "", subject = "", author = "", committedAt = ""] =
    showStdout.trimEnd().split("\n");

  if (!commitSha || !treeSha || !committedAt) {
    throw new Error("Incomplete git checkpoint metadata");
  }

  return {
    trigger,
    command,
    observedAt,
    commitSha,
    parentShas: parents ? parents.split(" ").filter(Boolean) : [],
    treeSha,
    subject,
    author,
    committedAt,
    filesChanged: diffStdout.split("\n").filter(Boolean).length,
    source: "bridge_parser",
  };
}

export function shortSha(commitSha: string): string {
  return commitSha.slice(0, 7);
}

export interface GitCheckpointBridgePayload {
  trigger: GitCheckpointTrigger;
  command: string;
  observedAt: string;
  commitSha: string;
  parentShas: string[];
  treeSha: string;
  subject: string;
  author: string;
  committedAt: string;
  filesChanged: number;
  source?: "bridge_parser" | "git_hook";
  checkpointContextId?: string | null;
  promptEventId?: string | null;
  hookName?: "post-commit" | "post-rewrite";
  rewrittenFromCommitSha?: string | null;
}

export function parseTraceCheckpointContextId(message: string): string | null {
  const match = TRACE_CHECKPOINT_TRAILER_RE.exec(message);
  return match?.[1]?.trim() || null;
}

export function addTraceCheckpointTrailer(
  message: string,
  checkpointContextId: string,
): string {
  if (!checkpointContextId.trim()) return message;
  if (parseTraceCheckpointContextId(message)) return message;

  const trimmed = message.replace(/\s+$/u, "");
  const separator = trimmed.length === 0 ? "" : "\n\n";
  return `${trimmed}${separator}${TRACE_CHECKPOINT_TRAILER}: ${checkpointContextId}\n`;
}

const GIT_CHECKPOINT_RE = /\bgit\s+(commit|push)\b/gi;

function inferTrigger(command: string): GitCheckpointTrigger | null {
  const matches = [...command.matchAll(GIT_CHECKPOINT_RE)].map((match) => match[1]?.toLowerCase());
  const hasCommit = matches.includes("commit");
  const hasPush = matches.includes("push");
  if (hasCommit && hasPush) return "commit_and_push";
  if (hasCommit) return "commit";
  if (hasPush) return "push";
  return null;
}

/**
 * Phase 1: scan an assistant message for Bash/Command tool_use blocks whose
 * input contains a git commit or push command.  Returns a map of
 * tool_use_id → { trigger, command } for each match found.
 *
 * Call this on every ToolOutput and accumulate the results in a per-session
 * Map so that phase 2 can match the corresponding tool_result.
 */
export function extractGitToolUsePending(
  output: ToolOutput,
): Map<string, { trigger: GitCheckpointTrigger; command: string }> {
  const pending = new Map<string, { trigger: GitCheckpointTrigger; command: string }>();
  if (output.type !== "assistant") return pending;

  for (const block of output.message.content) {
    if (block.type !== "tool_use") continue;
    const toolName = block.name.toLowerCase();
    if (toolName !== "bash" && toolName !== "command") continue;
    if (!block.id) continue;

    const command =
      typeof block.input?.command === "string"
        ? block.input.command.trim()
        : typeof block.input?.cmd === "string"
          ? block.input.cmd.trim()
          : "";
    if (!command) continue;

    const trigger = inferTrigger(command);
    if (trigger) pending.set(block.id, { trigger, command });
  }
  return pending;
}

/**
 * Phase 2: scan an assistant message for tool_result blocks that match a
 * pending git tool_use_id (Claude Code style, where the command lives in the
 * tool_use and the result is a plain string).
 *
 * Also handles adapters that embed command + exitCode in the tool_result
 * content object (Codex style) without needing phase-1 state.
 */
export function extractGitToolResultTrigger(
  output: ToolOutput,
  pendingGitToolUses: Map<string, { trigger: GitCheckpointTrigger; command: string }>,
): { trigger: GitCheckpointTrigger; command: string; toolUseId: string } | null {
  if (output.type !== "assistant") return null;

  for (const block of output.message.content) {
    if (block.type !== "tool_result") continue;

    // Path 1: Claude Code — match via tool_use_id
    if (block.tool_use_id) {
      const pending = pendingGitToolUses.get(block.tool_use_id);
      if (pending) return { ...pending, toolUseId: block.tool_use_id };
    }

    // Path 2: content-object adapters (Codex etc.) — command + exitCode in content
    const toolName = block.name.toLowerCase();
    if (toolName !== "command" && toolName !== "bash") continue;

    const content = asJsonObject(block.content);
    const command =
      typeof content?.command === "string"
        ? content.command.trim()
        : typeof content?.cmd === "string"
          ? content.cmd.trim()
          : "";
    const exitCode =
      typeof content?.exitCode === "number"
        ? content.exitCode
        : typeof content?.exit_code === "number"
          ? content.exit_code
          : undefined;
    if (!command || exitCode !== 0) continue;

    const trigger = inferTrigger(command);
    if (trigger) return { trigger, command, toolUseId: "" };
  }

  return null;
}

/** @deprecated Use extractGitToolUsePending + extractGitToolResultTrigger instead */
export function extractGitCheckpointTrigger(
  output: ToolOutput,
): { trigger: GitCheckpointTrigger; command: string } | null {
  const result = extractGitToolResultTrigger(output, new Map());
  return result ? { trigger: result.trigger, command: result.command } : null;
}
