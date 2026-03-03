export interface ParsedEnrichment {
  sessionId?: string;
  lastAssistantText: string;
  usage?: { input_tokens: number; output_tokens: number };
  costUsd?: number;
  detectedToolName?: "AskUserQuestion" | "ExitPlanMode";
  detectedToolInput?: unknown;
}

export type AgentType = "claude" | "codex";

export interface EffortOption {
  value: string;
  label: string;
}

export interface AgentCapabilities {
  displayName: string;
  supportsResume: boolean;
  supportsPlanMode: boolean;
  models: { value: string; label: string; effortOptions?: EffortOption[] }[];
  defaultModel: string;
  effortLabel?: string;
}

export interface AgentDetectResult {
  available: boolean;
  version?: string;
  error?: string;
  authStatus?: "ok" | "missing";
  authHint?: string;
  installHint?: string;
}

export interface StreamParserCallbacks {
  onSessionId: (id: string) => void;
  onActivity: () => void;
  onInputRequired: () => void;
}

export interface StreamParserOpts {
  serverUrl: string;
  workspaceId: string;
  cwd: string;
  callbacks: StreamParserCallbacks;
  log: (line: string) => void;
}

export interface AgentStreamParser {
  processChunk(chunk: string): void;
  flush(): void;
  getEnrichment(): ParsedEnrichment;
  waitForPendingPosts(): Promise<void>;
}

export interface AgentCommand {
  command: string;
  args: string[];
  stdin?: string;
  stdinMode: "ignore" | "pipe";
  envFilter?: (key: string) => boolean;
}

export interface AgentSpawnContext {
  workspaceId: string;
  prompt: string;
  worktreePath: string;
  model?: string;
  effort?: string;
  resumeSessionId?: string;
  permissionMode?: string;
  filePaths?: string[];
}

export interface AgentAdapter {
  readonly type: AgentType;
  readonly capabilities: AgentCapabilities;
  detect(): Promise<AgentDetectResult>;
  buildCommand(ctx: AgentSpawnContext): Promise<AgentCommand>;
  createParser(opts: StreamParserOpts): AgentStreamParser;
}
