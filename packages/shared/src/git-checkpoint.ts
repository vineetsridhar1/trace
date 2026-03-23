import { asJsonObject } from "./json.js";
import type { ToolOutput } from "./adapters/coding-tool.js";

export type GitCheckpointTrigger = "commit" | "push" | "commit_and_push";

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

export function extractGitCheckpointTrigger(
  output: ToolOutput,
): { trigger: GitCheckpointTrigger; command: string } | null {
  if (output.type !== "assistant") return null;

  for (const block of output.message.content) {
    if (block.type !== "tool_result") continue;

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
    if (trigger) return { trigger, command };
  }

  return null;
}
