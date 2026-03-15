/**
 * Normalized output events emitted by all coding tool adapters.
 * The frontend renders exclusively against these types — adapters are
 * responsible for translating tool-specific formats into this schema.
 */

export interface ContentBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input?: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  name: string;
  content?: string | Record<string, unknown>;
}

export type MessageBlock = ContentBlock | ToolUseBlock | ToolResultBlock;

export interface AssistantEvent {
  type: "assistant";
  message: { content: MessageBlock[] };
}

export interface ResultEvent {
  type: "result";
  subtype?: "success" | "error";
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ToolOutput = AssistantEvent | ResultEvent | ErrorEvent;

export type OutputCallback = (data: ToolOutput) => void;

export interface RunOptions {
  prompt: string;
  cwd: string;
  onOutput: OutputCallback;
  onComplete: () => void;
}

/**
 * Interface for coding tool adapters (Claude Code, Cursor, etc.).
 * Implementations spawn and manage a coding tool process.
 * All output must conform to the ToolOutput union — adapters translate
 * tool-specific formats in their run() implementation.
 */
export interface CodingToolAdapter {
  run(options: RunOptions): void;
  abort(): void;
}
