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
  id?: string;
  name: string;
  input?: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id?: string;
  name: string;
  content?: string | Record<string, unknown>;
  /** Set by some adapters (e.g. Claude Code) when the tool returned a non-zero exit code. */
  is_error?: boolean;
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface QuestionBlock {
  type: "question";
  questions: Question[];
  toolUseId?: string;
}

export interface PlanBlock {
  type: "plan";
  content: string;
  filePath?: string;
  toolUseId?: string;
}

export type MessageBlock =
  | ContentBlock
  | ToolUseBlock
  | ToolResultBlock
  | QuestionBlock
  | PlanBlock;

/**
 * Check whether a session_output payload contains a PlanBlock.
 * Shared between the server (recordOutput / complete) and the frontend (node detection).
 */
export function hasPlanBlock(data: Record<string, unknown>): boolean {
  if (data.type !== "assistant") return false;
  const message = data.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block: unknown) => {
    if (block == null || typeof block !== "object") return false;
    return (block as Record<string, unknown>).type === "plan";
  });
}

/**
 * Check whether a session_output payload contains a QuestionBlock.
 * Shared between the server (recordOutput / complete) and the frontend (node detection).
 */
export function hasQuestionBlock(data: Record<string, unknown>): boolean {
  if (data.type !== "assistant") return false;
  const message = data.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block: unknown) => {
    if (block == null || typeof block !== "object") return false;
    return (block as Record<string, unknown>).type === "question";
  });
}

/** Parse a raw unknown value into a Question, with safe defaults */
export function parseQuestion(raw: unknown): Question {
  const r =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return {
    question: String(r.question ?? ""),
    header: String(r.header ?? ""),
    options: Array.isArray(r.options)
      ? r.options.map((o: unknown) => {
          const opt =
            o != null && typeof o === "object" && !Array.isArray(o)
              ? (o as Record<string, unknown>)
              : ({} as Record<string, unknown>);
          return { label: String(opt.label ?? ""), description: String(opt.description ?? "") };
        })
      : [],
    multiSelect: r.multiSelect === true,
  };
}

export interface AssistantEvent {
  type: "assistant";
  message: { content: MessageBlock[] };
  /** Set when this message was produced inside a subagent, pointing to the spawning tool_use id. */
  parentToolUseId?: string;
}

export interface UserEvent {
  type: "user";
  message: { content: MessageBlock[] };
  parentToolUseId?: string;
}

export interface ResultEvent {
  type: "result";
  subtype?: "success" | "error";
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ToolOutput = AssistantEvent | UserEvent | ResultEvent | ErrorEvent;

export type OutputCallback = (data: ToolOutput) => void;

const MISSING_TOOL_SESSION_PATTERNS = [
  /\bno\s+(conversation|session|thread|chat)\s+found\b/i,
  /\b(conversation|session|thread|chat)\b[\s\S]{0,80}\b(not found|does not exist|could not be found)\b/i,
  /\b(not found|does not exist|could not be found)\b[\s\S]{0,80}\b(conversation|session|thread|chat)\b/i,
  /\bresume\b[\s\S]{0,80}\b(not found|does not exist|could not be found)\b/i,
  /\b(conversation|session|thread|chat)[/-]resume\b[\s\S]{0,80}\bfailed\b/i,
  /\bno\s+rollout\s+found\s+for\s+thread\s+id\b/i,
];

export function isMissingToolSessionError(message: string): boolean {
  return MISSING_TOOL_SESSION_PATTERNS.some((pattern) => pattern.test(message));
}

export interface RunOptions {
  prompt: string;
  cwd: string;
  onOutput: OutputCallback;
  onComplete: () => void;
  interactionMode?: "code" | "plan" | "ask";
  model?: string;
  reasoningEffort?: string;
  /** Tool-specific session ID for resuming (e.g. Claude Code's --resume flag) */
  toolSessionId?: string;
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
  /** Return the tool-specific session/thread ID for resume, if available */
  getSessionId?(): string | null;
}
