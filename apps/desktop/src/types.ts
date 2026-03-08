import { type ComponentType, type ReactNode } from "react";

const DEFAULT_SERVER_URL = "http://localhost:3100";

let cachedServerUrl: string | null = null;

export function getServerUrl(): string {
  if (cachedServerUrl) return cachedServerUrl;
  if (typeof window !== "undefined" && window.traceAPI?.getServerUrl) {
    cachedServerUrl = window.traceAPI.getServerUrl();
    return cachedServerUrl;
  }
  return DEFAULT_SERVER_URL;
}

export interface WorktreeDiffResult {
  success: boolean;
  branchDiff?: string;
  uncommittedDiff?: string;
  stagedDiff?: string;
  status?: string;
  error?: string;
}

export interface LocalChannelConfig {
  localRepoPath: string;
  setupScript?: string;
  runScript?: string;
  teardownScript?: string;
  systemInstructions?: string;
}

export interface GlobalAppConfig {
  terminalFontFamily?: string;
}

export type AgentType = "claude" | "codex";

export interface SpawnConfig {
  agentType: AgentType;
  workspaceId: string;
  prompt: string;
  repoPath: string;
  creationCommands?: string[];
  resumeSessionId?: string;
  filePaths?: string[];
  model?: string;
  effort?: string;
  systemInstructions?: string;
  permissionMode?: string;
  baseBranch?: string;
  branchPrefix?: string;
  channelId?: string;
}

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

export interface DetectedAgent {
  type: AgentType;
  capabilities: AgentCapabilities;
  detectResult: AgentDetectResult;
}

export interface TraceAPI {
  getServerUrl: () => string;
  spawnAgent: (config: SpawnConfig) => Promise<{
    success: boolean;
    worktreePath?: string;
    setupOutput?: string;
    error?: string;
  }>;
  stopAgent: (
    workspaceId: string,
  ) => Promise<{ success: boolean; stopped?: boolean; error?: string }>;
  detectAgents: () => Promise<{
    success: boolean;
    agents?: DetectedAgent[];
    error?: string;
  }>;
  deleteWorktree: (
    workspaceId: string,
    repoPath: string,
    teardownCommands?: string[],
  ) => Promise<{
    success: boolean;
    removed?: boolean;
    worktreePath?: string;
    error?: string;
  }>;
  checkWorktreeExists: (
    workspaceId: string,
    repoPath: string,
  ) => Promise<{
    success: boolean;
    exists?: boolean;
    worktreePath?: string;
    error?: string;
  }>;
  mergeWorktree: (
    workspaceId: string,
    repoPath: string,
    baseBranch: string,
  ) => Promise<{ success: boolean; branch?: string; error?: string }>;
  commitWorktreeChanges: (
    workspaceId: string,
  ) => Promise<{ success: boolean; committed?: boolean; error?: string }>;
  reportAgentActivity: (
    workspaceId: string,
    eventType: string,
    sessionId?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  createPty: (
    terminalId: string,
    cwd: string,
    extraEnv?: Record<string, string>,
  ) => Promise<{ success: boolean; error?: string }>;
  writePty: (terminalId: string, data: string) => Promise<{ success: boolean }>;
  resizePty: (
    terminalId: string,
    cols: number,
    rows: number,
  ) => Promise<{ success: boolean }>;
  killPty: (terminalId: string) => Promise<{ success: boolean }>;
  hasPty: (
    terminalId: string,
  ) => Promise<{ success: boolean; exists: boolean }>;
  getPtyProcesses: (terminalIds: string[]) => Promise<{
    success: boolean;
    processes: Record<string, { processName: string; isShellOnly: boolean }>;
  }>;
  onPtyData: (
    callback: (terminalId: string, data: string) => void,
  ) => () => void;
  onPtyExit: (
    callback: (terminalId: string, exitCode: number) => void,
  ) => () => void;
  onCloseTerminalTab: (callback: () => void) => () => void;
  getWorktreeDiff: (
    workspaceId: string,
    baseBranch: string,
  ) => Promise<WorktreeDiffResult>;
  allocatePorts: (
    workspaceId: string,
    count: number,
  ) => Promise<{ success: boolean; ports?: number[]; error?: string }>;
  releasePorts: (
    workspaceId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  focusWindow: () => Promise<void>;
  selectFolder: () => Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  getLocalConfig: (channelId: string) => Promise<LocalChannelConfig | null>;
  setLocalConfig: (
    channelId: string,
    data: LocalChannelConfig,
  ) => Promise<{ success: boolean }>;
  getAllLocalConfigs: () => Promise<Record<string, LocalChannelConfig>>;
  deleteLocalConfig: (channelId: string) => Promise<{ success: boolean }>;
  getGlobalConfig: () => Promise<GlobalAppConfig>;
  setGlobalConfig: (data: GlobalAppConfig) => Promise<{ success: boolean }>;
  listRepoFiles: (
    repoPath: string,
  ) => Promise<{ success: boolean; files: string[]; error?: string }>;
  suggestScripts: (repoPath: string) => Promise<{
    success: boolean;
    setupScript?: string;
    runScript?: string;
    reasoning?: string;
    error?: string;
  }>;
  validateRepo: (
    repoPath: string,
  ) => Promise<{ valid: boolean; originUrl?: string; error?: string }>;
  listRepoBranches: (
    repoPath: string,
  ) => Promise<{ success: boolean; branches: string[]; error?: string }>;
  checkBranchesMerged: (
    repoPath: string,
    targets: Array<{ workspaceId: string; branch: string }>,
    baseBranch: string,
  ) => Promise<{
    success: boolean;
    merged: Record<string, boolean>;
    error?: string;
  }>;
  watchBaseBranch: (
    repoPath: string,
    baseBranch: string,
  ) => Promise<{ success: boolean }>;
  unwatchBaseBranch: () => Promise<{ success: boolean }>;
  onBaseBranchChanged: (callback: () => void) => () => void;
  githubLogin: () => Promise<{
    success: boolean;
    token?: string;
    user?: {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      githubUsername: string | null;
    };
    error?: string;
  }>;
  checkMainStatus: (
    repoPath: string,
    baseBranch: string,
  ) => Promise<{
    success: boolean;
    isUpToDate?: boolean;
    commitsBehind?: number;
    commits?: { hash: string; author: string; message: string; date: string }[];
    localSha?: string;
    remoteSha?: string;
    error?: string;
  }>;
  pullMain: (
    repoPath: string,
    baseBranch: string,
  ) => Promise<{ success: boolean; error?: string }>;
  detectInstalledApps: () => Promise<{
    success: boolean;
    apps: Array<{ id: string; label: string }>;
    error?: string;
  }>;
  openInApp: (
    appId: string,
    targetPath: string,
  ) => Promise<{ success: boolean; error?: string }>;
  listSlashCommands: (repoPath: string) => Promise<{
    success: boolean;
    commands: Array<{
      name: string;
      description: string;
      source: "global" | "project";
    }>;
    error?: string;
  }>;
  checkGhAuth: () => Promise<{ success: boolean; available: boolean }>;
  checkPRStatusesLocal: (
    repoPath: string,
    branches: string[],
  ) => Promise<{
    success: boolean;
    statuses?: Array<{
      branch: string;
      state: "open" | "closed" | "merged" | "none";
      prUrl: string | null;
    }>;
    error?: string;
  }>;
  checkPRCILocal: (
    repoPath: string,
    branches: string[],
  ) => Promise<{
    success: boolean;
    statuses?: Array<{
      branch: string;
      total: number;
      passed: number;
      failed: number;
      pending: number;
    }>;
    error?: string;
  }>;
  listPullRequests: (repoPath: string) => Promise<{
    success: boolean;
    pullRequests?: PullRequest[];
    error?: string;
  }>;
  checkoutPullRequest: (
    repoPath: string,
    branchName: string,
    workspaceId: string,
    setupCommands?: string[],
  ) => Promise<{
    success: boolean;
    worktreePath?: string;
    error?: string;
  }>;
  pushWorktreeBranch: (
    workspaceId: string,
    repoPath: string,
  ) => Promise<{ success: boolean; error?: string }>;
  ensureWorktreeFromRemote: (
    workspaceId: string,
    repoPath: string,
    branchName: string,
  ) => Promise<{ success: boolean; worktreePath?: string; error?: string }>;
  checkRunningProcesses: (
    workspaceIds: string[],
  ) => Promise<{ success: boolean; running: string[] }>;

  readProductDocFile: (filePath: string) => Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }>;

  writeProductDocFile: (
    filePath: string,
    content: string,
  ) => Promise<{ success: boolean; error?: string }>;

  createGitBranch: (
    repoPath: string,
    branchName: string,
    baseBranch: string,
    scopingDocsPath?: string,
    sourceBranch?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  getWorktreeBranch: (
    workspaceId: string,
  ) => Promise<{ success: boolean; branch?: string; error?: string }>;

  autoDeleteCleanWorktree: (
    workspaceId: string,
    repoPath: string,
    teardownCommands?: string[],
  ) => Promise<{
    success: boolean;
    deleted?: boolean;
    reason?: string;
    worktreePath?: string;
    error?: string;
  }>;

  setInstanceAuth: (token: string, serverId: string) => Promise<void>;
  clearInstanceAuth: () => Promise<void>;

  instanceGetId: () => Promise<string>;
  instanceGetName: () => Promise<string>;
  instanceSetName: (name: string) => Promise<{ success: boolean }>;
  instanceSetPassword: (password: string | null) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onWsConnectionStatus: (
    callback: (status: "connected" | "connecting" | "disconnected") => void,
  ) => () => void;
}

declare global {
  interface Window {
    traceAPI: TraceAPI;
  }
}

export interface ServerEvent {
  id: string;
  cliSessionId: string;
  hookEventName: string;
  timestamp: string;
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  toolUseId: string | null;
  stopHookActive: boolean | null;
  lastAssistantMessage: string | null;
  rawPayload: unknown;
  sessionId: string;
  importance: string;
}

export interface Server {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  workspacesEnabled: boolean;
  teamIds: string[];
  localRepoPath?: string | null;
  baseBranch: string | null;
  githubUrl: string | null;
  defaultRepoPath?: string | null;
  defaultSetupScript?: string | null;
  defaultRunScript?: string | null;
  defaultTeardownScript?: string | null;
  setupScript?: string | null;
  runScript?: string | null;
  teardownScript?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCliSession {
  sessionId: string;
  cwd: string | null;
  status: string;
  permissionMode?: string | null;
}

export interface Workspace {
  id: string;
  channelId: string;
  cliSessionId: string;
  userId: string | null;
  preview: string | null;
  importance: string;
  status: TicketStatus;
  summary: string | null;
  branch: string | null;
  agentSessionId: string | null;
  agentType: string | null;
  createdAt: string;
  cliSession: WorkspaceCliSession;
  user: { id: string; name: string; avatarUrl: string | null } | null;
  sessionCount: number;
  queuedRunConfig: {
    prompt: string;
    model: string;
    effort: string;
    planMode: boolean;
  } | null;
  isProductDoc: boolean;
}

export type ChannelType = "channel" | "team" | "project";
export type TicketStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "creation"
  | "merged"
  | "needs_input"
  | "queued"
  | "review"
  | "handed_off";
export type SessionStatus = "idle" | "loading" | "ready" | "empty" | "error";
export type DragTarget = "left" | "right" | null;
export type ProductDocMode = "prd" | "tech-scope" | "tickets";
export type MiddlePanelView =
  | "chat"
  | "board"
  | "workspaces"
  | "documents"
  | "projects"
  | "pull-requests";

export interface PullRequest {
  number: number;
  title: string;
  headRefName: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  url: string;
  labels: Array<{ name: string; color: string }>;
}

export interface TicketAttachment {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  url: string;
}

export interface SemanticContext {
  keyChanges?: Array<{ file: string; summary: string }>;
  decisions?: string[];
  tradeoffs?: string[];
  technicalContext?: string[];
  blockers?: string[];
}

export interface TicketMetadata {
  tags?: string[];
  complexity?: "low" | "medium" | "high";
  semanticContext?: SemanticContext;
}

export interface KanbanTicket {
  id: string;
  workspaceId: string | null;
  columnId: string;
  columnSlug?: string;
  title: string;
  description: string | null;
  solutionApproach: string | null;
  status: string;
  metadata: unknown;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  workspace: {
    id: string;
    userId: string | null;
    branch: string | null;
    prUrl: string | null;
    status: string;
    createdAt: string;
    attachments?: TicketAttachment[];
  } | null;
}

/** Type-safe accessor for ticket metadata */
export function getTicketMetadata(ticket: KanbanTicket): TicketMetadata {
  if (!ticket.metadata || typeof ticket.metadata !== "object") return {};
  return ticket.metadata as TicketMetadata;
}

export interface KanbanColumn {
  id: string;
  channelId: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
  tickets: KanbanTicket[];
}

export interface AiChat {
  id: string;
  serverId: string;
  channelId: string | null;
  title: string;
  lastMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface SessionEventNode {
  kind: "event";
  event: ServerEvent;
}

export interface ReadGlobGroupNode {
  kind: "readglob-group";
  id: string;
  count: number;
  startTimestamp: string;
  endTimestamp: string;
  summaryLabels: string[];
  events: ServerEvent[];
}

export interface PlanReviewNode {
  kind: "plan-review";
  id: string;
  planContent: string;
  planFilePath: string;
  event: ServerEvent;
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

export interface AskUserQuestionNode {
  kind: "ask-user-question";
  id: string;
  questions: Question[];
  event: ServerEvent;
}

export interface TodoItem {
  content: string;
  status: string;
}

export interface SessionDividerNode {
  kind: "session-divider";
  id: string;
  timestamp: string;
}

export interface CollapsedTurnGroupNode {
  kind: "collapsed-turn";
  id: string;
  stepCount: number;
  toolCallCount: number;
  messageCount: number;
  innerNodes: SessionRenderNode[];
}

export type SessionRenderNode =
  | SessionEventNode
  | ReadGlobGroupNode
  | PlanReviewNode
  | AskUserQuestionNode
  | SessionDividerNode
  | CollapsedTurnGroupNode;

export interface ExtractedDiffContent {
  title: string;
  filePath: string | null;
  diffText: string | null;
  fallbackText: string;
}

export interface ParsedHunk {
  content?: string;
  [key: string]: unknown;
}

export interface ParsedDiffFile {
  type?: string;
  oldPath?: string;
  newPath?: string;
  hunks?: ParsedHunk[];
  [key: string]: unknown;
}

export interface DiffComponentProps {
  viewType?: "split" | "unified";
  diffType?: string;
  hunks: ParsedHunk[];
  children?: (hunks: ParsedHunk[]) => ReactNode;
  [key: string]: unknown;
}

export interface HunkComponentProps {
  hunk: ParsedHunk;
  [key: string]: unknown;
}

export interface DiffRuntime {
  Diff: ComponentType<DiffComponentProps>;
  Hunk: ComponentType<HunkComponentProps>;
  parseDiff: (diffText: string) => ParsedDiffFile[];
  tokenize: (
    hunks: ParsedHunk[],
    options?: Record<string, unknown>,
  ) => { old: unknown[][]; new: unknown[][] };
  markEdits: (
    hunks: ParsedHunk[],
    options?: Record<string, unknown>,
  ) => unknown;
}
