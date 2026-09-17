import { CODING_TOOL_IDS, type CodingToolAdapter } from "@trace/shared";
import {
  AntigravityAdapter,
  ClaudeCodeAdapter,
  CodexAdapter,
  CursorComposerAdapter,
  PiAdapter,
} from "@trace/shared/adapters";
import type { CodingToolExecutableRegistry } from "./coding-tool-executables.js";

function executableProvider(
  executables: CodingToolExecutableRegistry,
  toolId: string,
  fallback: string,
): () => string {
  return () => executables.get(toolId).executablePath ?? fallback;
}

export function getSupportedCodingTools(executables: CodingToolExecutableRegistry): string[] {
  return [
    "custom",
    ...CODING_TOOL_IDS.filter(
      (toolId) => toolId !== "custom" && executables.get(toolId).executablePath,
    ),
  ];
}

export function createCodingToolAdapter(
  tool: string | undefined,
  executables: CodingToolExecutableRegistry,
): CodingToolAdapter {
  switch (tool) {
    case "antigravity":
      return new AntigravityAdapter(executableProvider(executables, "antigravity", "agy"));
    case "pi":
      return new PiAdapter(executableProvider(executables, "pi", "pi"));
    case "codex":
      return new CodexAdapter(executableProvider(executables, "codex", "codex"));
    case "cursor_composer":
      return new CursorComposerAdapter(
        executableProvider(executables, "cursor_composer", "cursor-agent"),
      );
    case "claude_code":
    default:
      return new ClaudeCodeAdapter(executableProvider(executables, "claude_code", "claude"));
  }
}
