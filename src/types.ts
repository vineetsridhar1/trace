import { type ComponentType, type ReactNode } from 'react';

const DEFAULT_SERVER_URL = 'http://localhost:3100';

let cachedServerUrl: string | null = null;

export function getServerUrl(): string {
  if (cachedServerUrl) return cachedServerUrl;
  if (typeof window !== 'undefined' && window.traceAPI?.getServerUrl) {
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
  systemInstructions?: string;
}

export interface TraceAPI {
  getServerUrl: () => string;
  spawnClaude: (
    messageId: string,
    prompt: string,
    repoPath: string,
    creationCommands?: string[],
    resumeSessionId?: string,
    filePaths?: string[],
    model?: string,
    effort?: string,
    systemInstructions?: string,
  ) => Promise<{ success: boolean; worktreePath?: string; error?: string }>;
  stopClaude: (
    messageId: string,
  ) => Promise<{ success: boolean; stopped?: boolean; error?: string }>;
  deleteWorktree: (
    messageId: string,
    repoPath: string,
  ) => Promise<{ success: boolean; removed?: boolean; worktreePath?: string; error?: string }>;
  checkWorktreeExists: (
    messageId: string,
    repoPath: string,
  ) => Promise<{ success: boolean; exists?: boolean; worktreePath?: string; error?: string }>;
  mergeWorktree: (
    messageId: string,
    repoPath: string,
    baseBranch: string,
  ) => Promise<{ success: boolean; branch?: string; error?: string }>;
  reportClaudeActivity: (
    messageId: string,
    eventType: string,
  ) => Promise<{ success: boolean; error?: string }>;
  createPty: (terminalId: string, cwd: string, extraEnv?: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  writePty: (terminalId: string, data: string) => Promise<{ success: boolean }>;
  resizePty: (terminalId: string, cols: number, rows: number) => Promise<{ success: boolean }>;
  killPty: (terminalId: string) => Promise<{ success: boolean }>;
  onPtyData: (callback: (terminalId: string, data: string) => void) => () => void;
  onPtyExit: (callback: (terminalId: string, exitCode: number) => void) => () => void;
  getWorktreeDiff: (messageId: string, baseBranch: string) => Promise<WorktreeDiffResult>;
  allocatePorts: (messageId: string, count: number) => Promise<{ success: boolean; ports?: number[]; error?: string }>;
  releasePorts: (messageId: string) => Promise<{ success: boolean; error?: string }>;
  focusWindow: () => Promise<void>;
  selectFolder: () => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
  getLocalConfig: (channelId: string) => Promise<LocalChannelConfig | null>;
  setLocalConfig: (channelId: string, data: LocalChannelConfig) => Promise<{ success: boolean }>;
  getAllLocalConfigs: () => Promise<Record<string, LocalChannelConfig>>;
  deleteLocalConfig: (channelId: string) => Promise<{ success: boolean }>;
  listRepoFiles: (repoPath: string) => Promise<{ success: boolean; files: string[]; error?: string }>;
  checkBranchesMerged: (repoPath: string, branches: string[], baseBranch: string) => Promise<{ success: boolean; merged: Record<string, boolean>; error?: string }>;
  watchBaseBranch: (repoPath: string, baseBranch: string) => Promise<{ success: boolean }>;
  unwatchBaseBranch: () => Promise<{ success: boolean }>;
  onBaseBranchChanged: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    traceAPI: TraceAPI;
  }
}

export interface ServerEvent {
  id: string;
  sessionId: string;
  hookEventName: string;
  timestamp: string;
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  toolUseId: string | null;
  stopHookActive: boolean | null;
  lastAssistantMessage: string | null;
  rawPayload: unknown;
  threadId: string;
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
  localRepoPath?: string | null;
  baseBranch: string | null;
  githubUrl: string | null;
  defaultRepoPath?: string | null;
  defaultSetupScript?: string | null;
  defaultRunScript?: string | null;
  setupScript?: string | null;
  runScript?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSession {
  sessionId: string;
  cwd: string | null;
  status: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  sessionId: string;
  preview: string | null;
  importance: string;
  status: TicketStatus;
  summary: string | null;
  branch: string | null;
  claudeSessionId: string | null;
  createdAt: string;
  session: MessageSession;
  threadCount: number;
}

export interface MessageThread {
  id: string;
  messageId: string;
  createdAt: string;
  eventCount: number;
}

export interface MessageEnvelope {
  channelId: string;
  message: ChannelMessage;
}

export interface ThreadEventEnvelope {
  channelId: string;
  messageId: string;
  threadId: string;
  event: ServerEvent;
}

export type TicketStatus = 'pending' | 'in_progress' | 'completed' | 'creation' | 'merged' | 'needs_input' | 'queued';
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';
export type EffortLevel = 'low' | 'medium' | 'high';
export type ThreadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export type DragTarget = 'left' | 'right' | null;
export type MiddlePanelView = 'chat' | 'board' | 'workspaces';

export interface TicketAttachment {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  url: string;
}

export interface KanbanTicket {
  id: string;
  messageId: string;
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
  message: {
    id: string;
    branch: string | null;
    status: string;
    createdAt: string;
    attachments?: TicketAttachment[];
  };
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

export interface TicketEnvelope {
  channelId: string;
  ticket: KanbanTicket;
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
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ThreadEventNode {
  kind: 'event';
  event: ServerEvent;
}

export interface ReadGlobGroupNode {
  kind: 'readglob-group';
  id: string;
  count: number;
  startTimestamp: string;
  endTimestamp: string;
  summaryLabels: string[];
  events: ServerEvent[];
}

export interface PlanReviewNode {
  kind: 'plan-review';
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
  kind: 'ask-user-question';
  id: string;
  questions: Question[];
  event: ServerEvent;
}

export interface TodoItem {
  content: string;
  status: string;
}

export interface ThreadDividerNode {
  kind: 'thread-divider';
  id: string;
  timestamp: string;
}

export type ThreadRenderNode = ThreadEventNode | ReadGlobGroupNode | PlanReviewNode | AskUserQuestionNode | ThreadDividerNode;

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
  viewType?: 'split' | 'unified';
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
}
