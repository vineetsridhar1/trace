import type { CodingTool } from "@trace/gql";
import {
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  CursorComposerIcon,
  PiIcon,
} from "../../ui/tool-icons";

export type ToolOptionValue = Extract<
  CodingTool,
  "claude_code" | "codex" | "cursor_composer" | "pi" | "antigravity"
>;
export type PickerLayer = "tools" | "providers" | "models";

export const TOOL_OPTIONS: readonly { value: ToolOptionValue; label: string }[] = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "cursor_composer", label: "Cursor Composer" },
  { value: "pi", label: "Pi" },
  { value: "antigravity", label: "Antigravity" },
];

export const LAYER_TRANSITION = { duration: 0.08 };

export function ToolIcon({ tool, className }: { tool: string; className?: string }) {
  if (tool === "claude_code") return <ClaudeIcon className={className} />;
  if (tool === "pi") return <PiIcon className={className} />;
  if (tool === "antigravity") return <AntigravityIcon className={className} />;
  if (tool === "cursor_composer") return <CursorComposerIcon className={className} />;
  return <CodexIcon className={className} />;
}

export function getToolLabel(tool: string): string {
  return TOOL_OPTIONS.find((option) => option.value === tool)?.label ?? tool;
}

export function normalizeTool(tool: string): ToolOptionValue {
  return tool === "codex" || tool === "pi" || tool === "antigravity" || tool === "cursor_composer"
    ? tool
    : "claude_code";
}
