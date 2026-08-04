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
  /** Token usage for this assistant message, when the tool reports it incrementally. */
  usage?: TokenUsage;
}

export interface UserEvent {
  type: "user";
  message: { content: MessageBlock[] };
  parentToolUseId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ResultEvent {
  type: "result";
  subtype?: "success" | "error";
  /** Token usage for the completed run, when the tool reports it. */
  usage?: TokenUsage;
}

export interface UsageEvent {
  type: "usage";
  /** Incremental token usage for the latest model call. */
  usage: TokenUsage;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  failure?: ToolFailureClassification;
}

export type ToolOutput = AssistantEvent | UserEvent | ResultEvent | UsageEvent | ErrorEvent;

export type OutputCallback = (data: ToolOutput) => void;

export type ToolFailureKind =
  | "conversation_missing"
  | "authentication_required"
  | "permission_denied"
  | "rate_limited"
  | "quota_exceeded"
  | "tool_missing"
  | "context_too_large"
  | "network_failure"
  | "service_unavailable"
  | "unknown";

export interface ToolFailureEvidence {
  provider: string;
  operation: "run" | "resume";
  source: "provider_event" | "stderr" | "process";
  message: string;
  providerCode?: string;
  httpStatus?: number;
  processCode?: string;
  exitCode?: number;
}

export interface ToolFailureClassification {
  kind: ToolFailureKind;
  confidence: "exact" | "strong" | "unknown";
  retryable: boolean;
  matchedRule?: string;
  evidence: ToolFailureEvidence;
}

const MISSING_TOOL_SESSION_PATTERNS = [
  /\bno\s+(conversation|session|thread|chat)\s+found\b/i,
  /\b(conversation|session|thread|chat)\b[\s\S]{0,80}\b(not found|does not exist|could not be found)\b/i,
  /\b(not found|does not exist|could not be found)\b[\s\S]{0,80}\b(conversation|session|thread|chat)\b/i,
  /\bresume\b[\s\S]{0,80}\b(not found|does not exist|could not be found)\b/i,
  /\b(conversation|session|thread|chat)[/-]resume\b[\s\S]{0,80}\bfailed\b/i,
  /\bno\s+rollout\s+found\s+for\s+thread\s+id\b/i,
];

const PROVIDER_CODE_KINDS: Readonly<Record<string, ToolFailureKind>> = {
  conversation_not_found: "conversation_missing",
  session_not_found: "conversation_missing",
  thread_not_found: "conversation_missing",
  unauthenticated: "authentication_required",
  authentication_required: "authentication_required",
  permission_denied: "permission_denied",
  rate_limited: "rate_limited",
  rate_limit_exceeded: "rate_limited",
  quota_exceeded: "quota_exceeded",
  context_length_exceeded: "context_too_large",
};

const PROCESS_CODE_KINDS: Readonly<Record<string, ToolFailureKind>> = {
  enoent: "tool_missing",
  econnrefused: "network_failure",
  econnreset: "network_failure",
  enetunreach: "network_failure",
  etimedout: "network_failure",
};

const HTTP_STATUS_KINDS: Readonly<Record<number, ToolFailureKind>> = {
  401: "authentication_required",
  403: "permission_denied",
  429: "rate_limited",
};

function retryableFailureKind(kind: ToolFailureKind): boolean {
  return kind === "rate_limited" || kind === "network_failure" || kind === "service_unavailable";
}

function classifiedFailure(
  evidence: ToolFailureEvidence,
  kind: ToolFailureKind,
  confidence: ToolFailureClassification["confidence"],
  matchedRule?: string,
): ToolFailureClassification {
  return {
    kind,
    confidence,
    retryable: retryableFailureKind(kind),
    ...(matchedRule ? { matchedRule } : {}),
    evidence,
  };
}

export function classifyToolFailure(evidence: ToolFailureEvidence): ToolFailureClassification {
  const providerCode = evidence.providerCode?.trim().toLowerCase();
  const providerCodeKind = providerCode ? PROVIDER_CODE_KINDS[providerCode] : undefined;
  if (providerCodeKind) {
    return classifiedFailure(evidence, providerCodeKind, "exact", `provider_code.${providerCode}`);
  }

  const httpStatusKind =
    evidence.httpStatus != null ? HTTP_STATUS_KINDS[evidence.httpStatus] : undefined;
  if (httpStatusKind) {
    return classifiedFailure(
      evidence,
      httpStatusKind,
      "exact",
      `http_status.${evidence.httpStatus}`,
    );
  }
  if (evidence.httpStatus != null && evidence.httpStatus >= 500) {
    return classifiedFailure(evidence, "service_unavailable", "exact", "http_status.5xx");
  }

  const processCode = evidence.processCode?.trim().toLowerCase();
  const processCodeKind = processCode ? PROCESS_CODE_KINDS[processCode] : undefined;
  if (processCodeKind) {
    return classifiedFailure(evidence, processCodeKind, "exact", `process_code.${processCode}`);
  }

  if (
    evidence.operation === "resume" &&
    MISSING_TOOL_SESSION_PATTERNS.some((pattern) => pattern.test(evidence.message))
  ) {
    return classifiedFailure(
      evidence,
      "conversation_missing",
      "strong",
      `${evidence.provider}.resume.conversation_missing`,
    );
  }

  return classifiedFailure(evidence, "unknown", "unknown");
}

export function isMeaningfulToolOutput(output: ToolOutput): boolean {
  if (output.type === "assistant" || output.type === "user") {
    return output.message.content.length > 0;
  }
  return output.type === "result" && output.subtype !== "error";
}

export function canAutoRecoverToolFailure(
  failure: ToolFailureClassification,
  hasMeaningfulOutput: boolean,
): boolean {
  return !hasMeaningfulOutput && failure.kind === "conversation_missing";
}

export function isMissingToolSessionError(message: string): boolean {
  return (
    classifyToolFailure({
      provider: "unknown",
      operation: "resume",
      source: "stderr",
      message,
    }).kind === "conversation_missing"
  );
}

export interface RunOptions {
  prompt: string;
  cwd: string;
  onOutput: OutputCallback;
  onComplete: () => void;
  interactionMode?: "code" | "plan" | "ask";
  model?: string;
  reasoningEffort?: string;
  /** When true, pass Claude Code's `--chrome` flag to enable Claude in Chrome. */
  enableClaudeInChrome?: boolean;
  /** Tool-specific session ID for resuming (e.g. Claude Code's --resume flag) */
  toolSessionId?: string;
  /** Invocation-scoped Trace capabilities supplied by the runtime bridge. */
  runtimeEnv?: Record<string, string>;
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
