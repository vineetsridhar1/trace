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
  id?: string;
  label: string;
  description: string;
}

export type QuestionType =
  | "single-select"
  | "multi-select"
  | "select-with-other"
  | "text"
  | "confirm"
  | "ranking"
  | "reference";

export interface Question {
  id?: string;
  type?: QuestionType;
  context?: string;
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  suggestions?: string[];
  accept?: string;
  other?: boolean;
  protocol?: "trace" | "native";
}

export interface QuestionBlock {
  type: "question";
  questions: Question[];
  toolUseId?: string;
}

export interface TraceInputResponse {
  id: string;
  selected: string[];
  text?: string;
  assumed: boolean;
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
    const candidate = block as Record<string, unknown>;
    return (
      candidate.type === "question" ||
      (candidate.type === "text" &&
        typeof candidate.text === "string" &&
        parseTraceRequestInputs(candidate.text).length > 0)
    );
  });
}

/** Parse a raw unknown value into a Question, with safe defaults */
export function parseQuestion(raw: unknown): Question {
  const r =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return normalizeQuestion({
    ...(typeof r.id === "string" ? { id: r.id } : {}),
    ...(isQuestionType(r.type) ? { type: r.type } : {}),
    ...(typeof r.context === "string" ? { context: r.context } : {}),
    question: String(r.question ?? ""),
    header: String(r.header ?? ""),
    options: Array.isArray(r.options)
      ? r.options.map((o: unknown) => {
          const opt =
            o != null && typeof o === "object" && !Array.isArray(o)
              ? (o as Record<string, unknown>)
              : ({} as Record<string, unknown>);
          return {
            ...(typeof opt.id === "string" ? { id: opt.id } : {}),
            label: String(opt.label ?? ""),
            description: String(opt.description ?? ""),
          };
        })
      : [],
    multiSelect: r.multiSelect === true,
    ...(typeof r.min === "number" && Number.isFinite(r.min) ? { min: r.min } : {}),
    ...(typeof r.max === "number" && Number.isFinite(r.max) ? { max: r.max } : {}),
    ...(typeof r.maxLength === "number" && Number.isFinite(r.maxLength)
      ? { maxLength: r.maxLength }
      : {}),
    ...(typeof r.placeholder === "string" ? { placeholder: r.placeholder } : {}),
    ...(Array.isArray(r.suggestions)
      ? { suggestions: r.suggestions.map((value) => String(value)) }
      : {}),
    ...(typeof r.accept === "string" ? { accept: r.accept } : {}),
    ...(typeof r.other === "boolean" ? { other: r.other } : {}),
    ...(r.protocol === "trace" ? { protocol: "trace" as const } : {}),
  });
}

const QUESTION_TYPES = new Set<QuestionType>([
  "single-select",
  "multi-select",
  "select-with-other",
  "text",
  "confirm",
  "ranking",
  "reference",
]);

function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === "string" && QUESTION_TYPES.has(value as QuestionType);
}

function normalizeQuestion(question: Question): Question {
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const optionType =
    type === "single-select" ||
    type === "multi-select" ||
    type === "select-with-other" ||
    type === "confirm" ||
    type === "ranking";
  const other = question.other === true || type === "select-with-other";
  const capacity =
    type === "confirm" && question.options.length === 0
      ? 2
      : question.options.length + (other ? 1 : 0);
  const normalized = { ...question };
  delete normalized.min;
  delete normalized.max;
  delete normalized.maxLength;
  if (optionType && capacity === 0) {
    return {
      ...normalized,
      type: "text",
      multiSelect: false,
      ...(question.maxLength == null
        ? {}
        : { maxLength: Math.max(1, Math.floor(question.maxLength)) }),
    };
  }
  const max =
    optionType && question.max != null ? Math.max(1, Math.floor(question.max)) : undefined;
  const min =
    optionType && question.min != null
      ? Math.min(max ?? capacity, Math.max(0, Math.floor(question.min)))
      : undefined;
  return {
    ...normalized,
    ...(min == null ? {} : { min }),
    ...(max == null ? {} : { max }),
    ...(question.maxLength == null
      ? {}
      : { maxLength: Math.max(1, Math.floor(question.maxLength)) }),
  };
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function readAttribute(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"));
  return match?.[2] ? decodeXml(match[2]) : undefined;
}

function readElement(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "iu"));
  return match?.[1] == null ? undefined : decodeXml(match[1].trim());
}

function readNumberAttribute(source: string, name: string): number | undefined {
  const value = readAttribute(source, name);
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeSelectionConstraints(
  attributes: string,
  capacity: number,
): { min?: number; max?: number } {
  const rawMax = readNumberAttribute(attributes, "max");
  const max = rawMax == null ? undefined : Math.max(1, Math.floor(rawMax));
  const rawMin = readNumberAttribute(attributes, "min");
  const min =
    rawMin == null ? undefined : Math.min(max ?? capacity, Math.max(0, Math.floor(rawMin)));
  return { min, max };
}

function normalizeMaxLength(attributes: string): number | undefined {
  const value = readNumberAttribute(attributes, "maxlength");
  return value == null ? undefined : Math.max(1, Math.floor(value));
}

/** Parse the portable XML question contract emitted by coding agents. */
export function parseTraceRequestInputs(text: string): Question[] {
  const questions: Question[] = [];
  const unfencedText = text.replace(/```[\s\S]*?```/gu, "");
  const blockPattern = /<trace:request-input\b([^>]*)>([\s\S]*?)<\/trace:request-input>/giu;
  for (const match of unfencedText.matchAll(blockPattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const typeValue = readAttribute(attributes, "type");
    const type = isQuestionType(typeValue) ? typeValue : "text";
    const options: QuestionOption[] = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/giu;
    for (const optionMatch of body.matchAll(optionPattern)) {
      const optionAttributes = optionMatch[1] ?? "";
      const label = decodeXml((optionMatch[2] ?? "").trim());
      if (!label) continue;
      options.push({
        id: readAttribute(optionAttributes, "id") ?? label,
        label,
        description: readAttribute(optionAttributes, "description") ?? "",
      });
    }
    const question = readElement(body, "question");
    if (!question) continue;
    const suggestions = Array.from(
      body.matchAll(/<suggestion(?:\s[^>]*)?>([\s\S]*?)<\/suggestion>/giu),
    )
      .map((entry) => decodeXml((entry[1] ?? "").trim()))
      .filter(Boolean);
    const other = readAttribute(attributes, "other") === "true" || type === "select-with-other";
    const optionType =
      type === "single-select" ||
      type === "multi-select" ||
      type === "select-with-other" ||
      type === "confirm" ||
      type === "ranking";
    const capacity =
      type === "confirm" && options.length === 0 ? 2 : options.length + (other ? 1 : 0);
    const normalizedType = optionType && capacity === 0 ? "text" : type;
    const constraints =
      optionType && normalizedType !== "text"
        ? normalizeSelectionConstraints(attributes, capacity)
        : {};
    const maxLength = normalizeMaxLength(attributes);
    questions.push({
      id: readAttribute(attributes, "id") ?? `question-${questions.length + 1}`,
      type: normalizedType,
      protocol: "trace",
      context: readElement(body, "context"),
      question,
      header: readElement(body, "header") ?? question,
      options,
      multiSelect: normalizedType === "multi-select",
      ...(constraints.min == null ? {} : { min: constraints.min }),
      ...(constraints.max == null ? {} : { max: constraints.max }),
      ...(maxLength == null ? {} : { maxLength }),
      placeholder: readAttribute(attributes, "placeholder"),
      accept: readAttribute(attributes, "accept"),
      other: normalizedType === "select-with-other" || (normalizedType !== "text" && other),
      ...(suggestions.length > 0 ? { suggestions } : {}),
    });
  }
  return questions;
}

/** Parse structured answers so clients can render a human-readable sent record. */
export function parseTraceInputResponses(text: string): TraceInputResponse[] {
  const responses: TraceInputResponse[] = [];
  const unfencedText = text.replace(/```[\s\S]*?```/gu, "");
  const pattern = /<trace:input-response\b([^>]*)>([\s\S]*?)<\/trace:input-response>/giu;
  for (const match of unfencedText.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const id = readAttribute(attributes, "id");
    if (!id) continue;
    const selected = Array.from(body.matchAll(/<selected(?:\s[^>]*)?>([\s\S]*?)<\/selected>/giu))
      .map((entry) => decodeXml((entry[1] ?? "").trim()))
      .filter(Boolean);
    responses.push({
      id,
      selected,
      text: readElement(body, "text"),
      assumed: readElement(body, "assumption") === "you-decide",
    });
  }
  return responses;
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
}

export type ToolOutput = AssistantEvent | UserEvent | ResultEvent | UsageEvent | ErrorEvent;

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
  /** When true, pass Claude Code's `--chrome` flag to enable Claude in Chrome. */
  enableClaudeInChrome?: boolean;
  /** Tool-specific session ID for resuming (e.g. Claude Code's --resume flag) */
  toolSessionId?: string;
  /** Invocation-scoped Trace capabilities supplied by the runtime bridge. */
  runtimeEnv?: Record<string, string>;
}

/** A sanitized, runtime-reported description of one coding-tool provider. */
export type CodingToolCatalogEntry = {
  tool: string;
  availability: "ready" | "unavailable" | "error";
  source: "discovered" | "fallback";
  version?: string;
  models: string[];
  reasoningEfforts: string[];
  features: string[];
  discoveredAt: string;
  diagnostic?: {
    code:
      | "executable_missing"
      | "unsupported_version"
      | "unauthenticated"
      | "timeout"
      | "malformed_response"
      | "unknown";
    message: string;
    remediation?: string;
  };
};

export type CodingToolCatalog = {
  scope: "global" | "workspace";
  workspacePath?: string;
  entries: CodingToolCatalogEntry[];
  fetchedAt: string;
  hash: string;
};

export interface DiscoverCatalogOptions {
  scope: "global" | "workspace";
  /** A bridge must validate this path against its authorized workdir before use. */
  workspacePath?: string;
  force?: boolean;
  signal?: AbortSignal;
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
  /** Optional provider-native discovery. Generic fallback remains runtime-owned. */
  discoverCatalog?(options: DiscoverCatalogOptions): Promise<CodingToolCatalogEntry>;
}
