export type AgentType = "claude" | "codex";

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

export type MiddlePanelView =
  | "chat"
  | "board"
  | "workspaces"
  | "projects"
  | "pull-requests";

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
  baseBranch: string | null;
  githubUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCliSession {
  sessionId: string;
  cwd: string | null;
  status: string;
}

export interface Workspace {
  id: string;
  channelId: string;
  cliSessionId: string;
  userId: string | null;
  preview: string | null;
  ticketTitle: string | null;
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
    branch: string | null;
    prUrl: string | null;
    status: string;
    createdAt: string;
    attachments?: TicketAttachment[];
  } | null;
}

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

export interface EffortOption {
  value: string;
  label: string;
}

export type DragTarget = "left" | "right" | null;
export type ProductDocMode = "prd" | "tech-scope" | "tickets";

export interface AiChat {
  id: string;
  serverId: string;
  channelId: string | null;
  title: string;
  lastMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

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
