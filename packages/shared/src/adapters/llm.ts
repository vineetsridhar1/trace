// ── Content block types ──

export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMTextContent {
  type: "text";
  text: string;
}

export interface LLMImageContent {
  type: "image";
  source:
    | { type: "base64"; mediaType: string; data: string }
    | { type: "url"; url: string };
}

export interface LLMToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMToolResultContent {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type LLMContentBlock =
  | LLMTextContent
  | LLMImageContent
  | LLMToolUseContent
  | LLMToolResultContent;

// ── Messages ──

export interface LLMMessage {
  role: LLMRole;
  content: string | LLMContentBlock[];
}

// ── Tool definitions ──

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ── Response types ──

export type LLMStopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: LLMContentBlock[];
  stopReason: LLMStopReason;
  usage: LLMUsage;
  model: string;
}

// ── Streaming events ──

export interface LLMStreamTextDelta {
  type: "text_delta";
  text: string;
}

export interface LLMStreamToolUseStart {
  type: "tool_use_start";
  id: string;
  name: string;
}

export interface LLMStreamToolUseInputDelta {
  type: "tool_use_input_delta";
  inputDelta: string;
}

export interface LLMStreamComplete {
  type: "complete";
  response: LLMResponse;
}

export interface LLMStreamError {
  type: "error";
  error: Error;
}

export type LLMStreamEvent =
  | LLMStreamTextDelta
  | LLMStreamToolUseStart
  | LLMStreamToolUseInputDelta
  | LLMStreamComplete
  | LLMStreamError;

// ── Request options ──

export interface LLMRequestOptions {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

// ── Adapter interface ──

export interface LLMAdapter {
  readonly provider: string;
  complete(options: LLMRequestOptions): Promise<LLMResponse>;
  stream(options: LLMRequestOptions): AsyncIterable<LLMStreamEvent>;
}
