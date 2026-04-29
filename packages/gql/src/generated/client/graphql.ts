/* eslint-disable */
import { JsonValue } from "../../json";
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: string; output: string };
  JSON: { input: JsonValue; output: JsonValue };
};

export type Actor = {
  __typename?: "Actor";
  avatarUrl?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name?: Maybe<Scalars["String"]["output"]>;
  type: ActorType;
};

export type ActorType = "agent" | "system" | "user";

export type AddChatMemberInput = {
  chatId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type AgentBudgetStatus = {
  __typename?: "AgentBudgetStatus";
  dailyLimitCents: Scalars["Int"]["output"];
  remainingCents: Scalars["Float"]["output"];
  remainingPercent: Scalars["Float"]["output"];
  spentCents: Scalars["Float"]["output"];
};

export type AgentCostEntry = {
  __typename?: "AgentCostEntry";
  date: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
  summaryCalls: Scalars["Int"]["output"];
  summaryCostCents: Scalars["Float"]["output"];
  tier2Calls: Scalars["Int"]["output"];
  tier2CostCents: Scalars["Float"]["output"];
  tier3Calls: Scalars["Int"]["output"];
  tier3CostCents: Scalars["Float"]["output"];
  totalCostCents: Scalars["Float"]["output"];
};

export type AgentCostSummary = {
  __typename?: "AgentCostSummary";
  budget: AgentBudgetStatus;
  dailyCosts: Array<AgentCostEntry>;
};

export type AgentEnvironment = {
  __typename?: "AgentEnvironment";
  adapterType: AgentEnvironmentAdapterType;
  config: Scalars["JSON"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  enabled: Scalars["Boolean"]["output"];
  id: Scalars["ID"]["output"];
  isDefault: Scalars["Boolean"]["output"];
  name: Scalars["String"]["output"];
  orgId: Scalars["ID"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type AgentEnvironmentAdapterType = "local" | "provisioned";

export type AgentEnvironmentTestResult = {
  __typename?: "AgentEnvironmentTestResult";
  message?: Maybe<Scalars["String"]["output"]>;
  ok: Scalars["Boolean"]["output"];
};

export type AgentExecutionLog = {
  __typename?: "AgentExecutionLog";
  agentId: Scalars["String"]["output"];
  batchSize: Scalars["Int"]["output"];
  confidence: Scalars["Float"]["output"];
  contextTokenAllocation?: Maybe<Scalars["JSON"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  disposition: ExecutionDisposition;
  estimatedCostCents: Scalars["Float"]["output"];
  finalActions?: Maybe<Scalars["JSON"]["output"]>;
  id: Scalars["ID"]["output"];
  inboxItemId?: Maybe<Scalars["String"]["output"]>;
  inputTokens: Scalars["Int"]["output"];
  latencyMs: Scalars["Int"]["output"];
  llmCalls: Array<AgentLlmCall>;
  model: Scalars["String"]["output"];
  modelTier: ModelTier;
  organizationId: Scalars["ID"]["output"];
  outputTokens: Scalars["Int"]["output"];
  plannedActions?: Maybe<Scalars["JSON"]["output"]>;
  policyDecision?: Maybe<Scalars["JSON"]["output"]>;
  promoted: Scalars["Boolean"]["output"];
  promotionReason?: Maybe<Scalars["String"]["output"]>;
  status: ExecutionStatus;
  triggerEventId: Scalars["String"]["output"];
};

export type AgentExecutionLogConnection = {
  __typename?: "AgentExecutionLogConnection";
  items: Array<AgentExecutionLog>;
  totalCount: Scalars["Int"]["output"];
};

export type AgentIdentity = {
  __typename?: "AgentIdentity";
  autonomyMode: AutonomyMode;
  costBudget: CostBudget;
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  organizationId: Scalars["ID"]["output"];
  soulFile: Scalars["String"]["output"];
  status: OrgAgentStatus;
  updatedAt: Scalars["DateTime"]["output"];
};

export type AgentLlmCall = {
  __typename?: "AgentLlmCall";
  createdAt: Scalars["DateTime"]["output"];
  estimatedCostCents: Scalars["Float"]["output"];
  executionLogId: Scalars["ID"]["output"];
  id: Scalars["ID"]["output"];
  inputTokens: Scalars["Int"]["output"];
  latencyMs: Scalars["Int"]["output"];
  maxTokens?: Maybe<Scalars["Int"]["output"]>;
  messages: Scalars["JSON"]["output"];
  model: Scalars["String"]["output"];
  outputTokens: Scalars["Int"]["output"];
  provider: Scalars["String"]["output"];
  responseContent: Scalars["JSON"]["output"];
  stopReason: Scalars["String"]["output"];
  systemPrompt?: Maybe<Scalars["String"]["output"]>;
  temperature?: Maybe<Scalars["Float"]["output"]>;
  tools: Scalars["JSON"]["output"];
  turnNumber: Scalars["Int"]["output"];
};

export type AgentStatus = "active" | "done" | "failed" | "not_started" | "stopped";

export type AgentTrustLevel = "autonomous" | "blocked" | "suggest";

export type AgentWorkerStatus = {
  __typename?: "AgentWorkerStatus";
  activeOrganizations: Scalars["Int"]["output"];
  openAggregationWindows: Scalars["Int"]["output"];
  running: Scalars["Boolean"]["output"];
  uptime?: Maybe<Scalars["Int"]["output"]>;
};

export type AggregationWindowInfo = {
  __typename?: "AggregationWindowInfo";
  eventCount: Scalars["Int"]["output"];
  lastEventAt: Scalars["DateTime"]["output"];
  openedAt: Scalars["DateTime"]["output"];
  organizationId: Scalars["ID"]["output"];
  scopeKey: Scalars["String"]["output"];
};

export type AiConversation = {
  __typename?: "AiConversation";
  branchCount: Scalars["Int"]["output"];
  branches: Array<Branch>;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  id: Scalars["ID"]["output"];
  rootBranch: Branch;
  title?: Maybe<Scalars["String"]["output"]>;
  updatedAt: Scalars["DateTime"]["output"];
  visibility: AiConversationVisibility;
};

export type AiConversationEvent = {
  __typename?: "AiConversationEvent";
  conversationId: Scalars["ID"]["output"];
  payload: Scalars["JSON"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type AiConversationVisibility = "ORG" | "PRIVATE";

export type ApiTokenProvider = "anthropic" | "github" | "openai" | "ssh_key";

export type ApiTokenStatus = {
  __typename?: "ApiTokenStatus";
  isSet: Scalars["Boolean"]["output"];
  provider: ApiTokenProvider;
  updatedAt?: Maybe<Scalars["DateTime"]["output"]>;
};

export type AutonomyMode = "act" | "observe" | "suggest";

export type Branch = {
  __typename?: "Branch";
  childBranches: Array<Branch>;
  conversation: AiConversation;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  depth: Scalars["Int"]["output"];
  forkTurn?: Maybe<Turn>;
  id: Scalars["ID"]["output"];
  label?: Maybe<Scalars["String"]["output"]>;
  parentBranch?: Maybe<Branch>;
  turnCount: Scalars["Int"]["output"];
  turns: Array<Turn>;
};

export type BranchDiffFile = {
  __typename?: "BranchDiffFile";
  additions: Scalars["Int"]["output"];
  deletions: Scalars["Int"]["output"];
  path: Scalars["String"]["output"];
  status: Scalars["String"]["output"];
};

export type BridgeAccessCapability = "session" | "terminal";

export type BridgeAccessGrant = {
  __typename?: "BridgeAccessGrant";
  capabilities: Array<BridgeAccessCapability>;
  createdAt: Scalars["DateTime"]["output"];
  expiresAt?: Maybe<Scalars["DateTime"]["output"]>;
  grantedByUser: User;
  granteeUser: User;
  id: Scalars["ID"]["output"];
  revokedAt?: Maybe<Scalars["DateTime"]["output"]>;
  scopeType: BridgeAccessScopeType;
  sessionGroup?: Maybe<SessionGroup>;
};

export type BridgeAccessRequest = {
  __typename?: "BridgeAccessRequest";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  ownerUser: User;
  requestedCapabilities: Array<BridgeAccessCapability>;
  requestedExpiresAt?: Maybe<Scalars["DateTime"]["output"]>;
  requesterUser: User;
  resolvedAt?: Maybe<Scalars["DateTime"]["output"]>;
  resolvedByUser?: Maybe<User>;
  scopeType: BridgeAccessScopeType;
  sessionGroup?: Maybe<SessionGroup>;
  status: BridgeAccessRequestStatus;
};

export type BridgeAccessRequestStatus = "approved" | "denied" | "pending";

export type BridgeAccessScopeType = "all_sessions" | "session_group";

export type BridgeRuntime = {
  __typename?: "BridgeRuntime";
  accessGrants: Array<BridgeAccessGrant>;
  accessRequests: Array<BridgeAccessRequest>;
  connected: Scalars["Boolean"]["output"];
  connectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  disconnectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  hostingMode: HostingMode;
  id: Scalars["ID"]["output"];
  instanceId: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  lastSeenAt: Scalars["DateTime"]["output"];
  /**
   * Currently-attached linked checkouts on this bridge, one per repo at most.
   * Empty when nothing is synced or the bridge is offline. Sourced from the
   * in-memory router cache, which is warmed on bridge connect.
   */
  linkedCheckouts: Array<LinkedCheckoutStatus>;
  metadata?: Maybe<Scalars["JSON"]["output"]>;
  ownerUser: User;
  registeredRepoIds: Array<Scalars["ID"]["output"]>;
};

export type BridgeRuntimeAccess = {
  __typename?: "BridgeRuntimeAccess";
  allowed: Scalars["Boolean"]["output"];
  bridgeRuntimeId?: Maybe<Scalars["ID"]["output"]>;
  capabilities: Array<BridgeAccessCapability>;
  connected: Scalars["Boolean"]["output"];
  expiresAt?: Maybe<Scalars["DateTime"]["output"]>;
  hostingMode?: Maybe<HostingMode>;
  isOwner: Scalars["Boolean"]["output"];
  label?: Maybe<Scalars["String"]["output"]>;
  ownerUser?: Maybe<User>;
  pendingRequest?: Maybe<BridgeAccessRequest>;
  runtimeInstanceId: Scalars["ID"]["output"];
  scopeType?: Maybe<BridgeAccessScopeType>;
  sessionGroupId?: Maybe<Scalars["ID"]["output"]>;
};

export type Channel = {
  __typename?: "Channel";
  aiMode?: Maybe<AutonomyMode>;
  baseBranch?: Maybe<Scalars["String"]["output"]>;
  groupId?: Maybe<Scalars["ID"]["output"]>;
  id: Scalars["ID"]["output"];
  members: Array<ChannelMember>;
  messages: Array<Event>;
  name: Scalars["String"]["output"];
  position: Scalars["Int"]["output"];
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  runScripts?: Maybe<Scalars["JSON"]["output"]>;
  setupScript?: Maybe<Scalars["String"]["output"]>;
  type: ChannelType;
};

export type ChannelMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type ChannelGroup = {
  __typename?: "ChannelGroup";
  channels: Array<Channel>;
  id: Scalars["ID"]["output"];
  isCollapsed: Scalars["Boolean"]["output"];
  name: Scalars["String"]["output"];
  position: Scalars["Int"]["output"];
};

export type ChannelMember = {
  __typename?: "ChannelMember";
  joinedAt: Scalars["DateTime"]["output"];
  user: User;
};

export type ChannelType = "coding" | "text";

export type Chat = {
  __typename?: "Chat";
  aiMode?: Maybe<AutonomyMode>;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  id: Scalars["ID"]["output"];
  members: Array<ChatMember>;
  messages: Array<Message>;
  name?: Maybe<Scalars["String"]["output"]>;
  type: ChatType;
  updatedAt: Scalars["DateTime"]["output"];
};

export type ChatMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type ChatMember = {
  __typename?: "ChatMember";
  joinedAt: Scalars["DateTime"]["output"];
  user: User;
};

export type ChatType = "dm" | "group";

export type CodingTool = "claude_code" | "codex" | "custom";

export type ConnectionsBridge = {
  __typename?: "ConnectionsBridge";
  bridge: BridgeRuntime;
  /** Whether the calling user has terminal capability on this bridge. */
  canTerminal: Scalars["Boolean"]["output"];
  repos: Array<ConnectionsRepoEntry>;
};

export type ConnectionsRepoEntry = {
  __typename?: "ConnectionsRepoEntry";
  /** Channel used to authorize terminal creation + source of runScripts. */
  channel: Channel;
  linkedCheckout?: Maybe<LinkedCheckoutStatus>;
  repo: Repo;
  runScripts?: Maybe<Scalars["JSON"]["output"]>;
};

export type ControllerRunStatus = "cancelled" | "completed" | "failed" | "queued" | "running";

export type CostBudget = {
  __typename?: "CostBudget";
  dailyLimitCents: Scalars["Int"]["output"];
};

export type CreateAgentEnvironmentInput = {
  adapterType: AgentEnvironmentAdapterType;
  config: Scalars["JSON"]["input"];
  enabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  isDefault?: InputMaybe<Scalars["Boolean"]["input"]>;
  name: Scalars["String"]["input"];
  orgId: Scalars["ID"]["input"];
};

export type CreateAiConversationInput = {
  title?: InputMaybe<Scalars["String"]["input"]>;
  visibility?: InputMaybe<AiConversationVisibility>;
};

export type CreateChannelGroupInput = {
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  position?: InputMaybe<Scalars["Int"]["input"]>;
};

export type CreateChannelInput = {
  baseBranch?: InputMaybe<Scalars["String"]["input"]>;
  groupId?: InputMaybe<Scalars["ID"]["input"]>;
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  position?: InputMaybe<Scalars["Int"]["input"]>;
  projectIds?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
  type?: InputMaybe<ChannelType>;
};

export type CreateChatInput = {
  memberIds: Array<Scalars["ID"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type CreateOrganizationInput = {
  name: Scalars["String"]["input"];
};

export type CreateProjectInput = {
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type CreateRepoInput = {
  defaultBranch?: InputMaybe<Scalars["String"]["input"]>;
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  remoteUrl: Scalars["String"]["input"];
};

export type CreateTicketInput = {
  acceptanceCriteria?: InputMaybe<Array<Scalars["String"]["input"]>>;
  assigneeIds?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  dependencyTicketIds?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  labels?: InputMaybe<Array<Scalars["String"]["input"]>>;
  organizationId: Scalars["ID"]["input"];
  priority?: InputMaybe<Priority>;
  projectId?: InputMaybe<Scalars["ID"]["input"]>;
  testPlan?: InputMaybe<Scalars["String"]["input"]>;
  title: Scalars["String"]["input"];
};

export type DeliveryResult =
  | "delivered"
  | "delivery_failed"
  | "no_runtime"
  | "runtime_disconnected"
  | "session_unbound";

export type EntityType = "channel" | "chat" | "message" | "session" | "ticket";

export type Event = {
  __typename?: "Event";
  actor: Actor;
  eventType: EventType;
  id: Scalars["ID"]["output"];
  metadata?: Maybe<Scalars["JSON"]["output"]>;
  parentId?: Maybe<Scalars["ID"]["output"]>;
  payload: Scalars["JSON"]["output"];
  scopeId: Scalars["ID"]["output"];
  scopeType: ScopeType;
  timestamp: Scalars["DateTime"]["output"];
};

export type EventType =
  | "agent_environment_created"
  | "agent_environment_deleted"
  | "agent_environment_updated"
  | "bridge_access_request_resolved"
  | "bridge_access_requested"
  | "bridge_access_revoked"
  | "bridge_access_updated"
  | "channel_created"
  | "channel_deleted"
  | "channel_group_created"
  | "channel_group_deleted"
  | "channel_group_updated"
  | "channel_member_added"
  | "channel_member_removed"
  | "channel_updated"
  | "chat_created"
  | "chat_member_added"
  | "chat_member_removed"
  | "chat_renamed"
  | "entity_linked"
  | "inbox_item_created"
  | "inbox_item_resolved"
  | "member_joined"
  | "member_left"
  | "message_deleted"
  | "message_edited"
  | "message_sent"
  | "organization_created"
  | "queued_message_added"
  | "queued_message_removed"
  | "queued_messages_cleared"
  | "queued_messages_drained"
  | "repo_created"
  | "repo_updated"
  | "session_deleted"
  | "session_group_archived"
  | "session_output"
  | "session_paused"
  | "session_pr_closed"
  | "session_pr_merged"
  | "session_pr_opened"
  | "session_resumed"
  | "session_runtime_connected"
  | "session_runtime_connecting"
  | "session_runtime_deprovision_failed"
  | "session_runtime_disconnected"
  | "session_runtime_provisioning"
  | "session_runtime_reconnected"
  | "session_runtime_start_failed"
  | "session_runtime_start_requested"
  | "session_runtime_start_timed_out"
  | "session_runtime_stopped"
  | "session_runtime_stopping"
  | "session_started"
  | "session_terminated"
  | "ticket_assigned"
  | "ticket_commented"
  | "ticket_created"
  | "ticket_execution_blocked"
  | "ticket_execution_created"
  | "ticket_execution_integrated"
  | "ticket_execution_integration_requested"
  | "ticket_execution_ready_for_review"
  | "ticket_execution_updated"
  | "ticket_linked"
  | "ticket_unassigned"
  | "ticket_unlinked"
  | "ticket_updated"
  | "ultraplan_completed"
  | "ultraplan_controller_run_completed"
  | "ultraplan_controller_run_created"
  | "ultraplan_controller_run_failed"
  | "ultraplan_controller_run_started"
  | "ultraplan_created"
  | "ultraplan_failed"
  | "ultraplan_human_gate_requested"
  | "ultraplan_paused"
  | "ultraplan_resumed"
  | "ultraplan_ticket_created"
  | "ultraplan_ticket_reordered"
  | "ultraplan_ticket_updated"
  | "ultraplan_updated";

export type ExecutionDisposition = "act" | "escalate" | "ignore" | "suggest" | "summarize";

export type ExecutionLogFilters = {
  disposition?: InputMaybe<ExecutionDisposition>;
  endDate?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
  startDate?: InputMaybe<Scalars["DateTime"]["input"]>;
  status?: InputMaybe<ExecutionStatus>;
};

export type ExecutionStatus = "blocked" | "dropped" | "failed" | "succeeded" | "suggested";

export type GitCheckpoint = {
  __typename?: "GitCheckpoint";
  author: Scalars["String"]["output"];
  commitSha: Scalars["String"]["output"];
  committedAt: Scalars["DateTime"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  filesChanged: Scalars["Int"]["output"];
  id: Scalars["ID"]["output"];
  parentShas: Array<Scalars["String"]["output"]>;
  promptEvent?: Maybe<Event>;
  promptEventId: Scalars["ID"]["output"];
  repo?: Maybe<Repo>;
  repoId: Scalars["ID"]["output"];
  session?: Maybe<Session>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupId: Scalars["ID"]["output"];
  sessionId: Scalars["ID"]["output"];
  subject: Scalars["String"]["output"];
  treeSha: Scalars["String"]["output"];
};

export type HostingMode = "cloud" | "local";

export type InboxItem = {
  __typename?: "InboxItem";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  itemType: InboxItemType;
  payload: Scalars["JSON"]["output"];
  resolvedAt?: Maybe<Scalars["DateTime"]["output"]>;
  sourceId: Scalars["ID"]["output"];
  sourceType: Scalars["String"]["output"];
  status: InboxItemStatus;
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  userId: Scalars["ID"]["output"];
};

export type InboxItemStatus = "active" | "dismissed" | "expired" | "resolved";

export type InboxItemType =
  | "agent_escalation"
  | "agent_suggestion"
  | "comment_suggestion"
  | "field_change_suggestion"
  | "link_suggestion"
  | "message_suggestion"
  | "plan"
  | "question"
  | "session_suggestion"
  | "ticket_suggestion"
  | "ultraplan_conflict_resolution"
  | "ultraplan_final_review"
  | "ultraplan_plan_approval"
  | "ultraplan_validation_request";

export type IntegrationStatus = "completed" | "conflicted" | "failed" | "not_started" | "running";

export type LinkedCheckoutActionResult = {
  __typename?: "LinkedCheckoutActionResult";
  error?: Maybe<Scalars["String"]["output"]>;
  errorCode?: Maybe<LinkedCheckoutErrorCode>;
  ok: Scalars["Boolean"]["output"];
  status: LinkedCheckoutStatus;
};

export type LinkedCheckoutErrorCode = "DIRTY_ROOT_CHECKOUT";

export type LinkedCheckoutStatus = {
  __typename?: "LinkedCheckoutStatus";
  attachedSessionGroup?: Maybe<SessionGroup>;
  attachedSessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  autoSyncEnabled: Scalars["Boolean"]["output"];
  currentBranch?: Maybe<Scalars["String"]["output"]>;
  currentCommitSha?: Maybe<Scalars["String"]["output"]>;
  hasUncommittedChanges: Scalars["Boolean"]["output"];
  isAttached: Scalars["Boolean"]["output"];
  lastSyncError?: Maybe<Scalars["String"]["output"]>;
  lastSyncedCommitSha?: Maybe<Scalars["String"]["output"]>;
  repo?: Maybe<Repo>;
  repoId: Scalars["ID"]["output"];
  repoPath?: Maybe<Scalars["String"]["output"]>;
  restoreBranch?: Maybe<Scalars["String"]["output"]>;
  restoreCommitSha?: Maybe<Scalars["String"]["output"]>;
  targetBranch?: Maybe<Scalars["String"]["output"]>;
};

export type LinkedCheckoutSyncConflictStrategy = "COMMIT" | "DISCARD" | "REBASE";

export type Message = {
  __typename?: "Message";
  actor: Actor;
  channelId?: Maybe<Scalars["ID"]["output"]>;
  chatId?: Maybe<Scalars["ID"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  deletedAt?: Maybe<Scalars["DateTime"]["output"]>;
  editedAt?: Maybe<Scalars["DateTime"]["output"]>;
  html?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  latestReplyAt?: Maybe<Scalars["DateTime"]["output"]>;
  mentions?: Maybe<Scalars["JSON"]["output"]>;
  parentMessageId?: Maybe<Scalars["ID"]["output"]>;
  replyCount: Scalars["Int"]["output"];
  text: Scalars["String"]["output"];
  threadRepliers: Array<Actor>;
  updatedAt: Scalars["DateTime"]["output"];
};

export type ModelTier = "tier2" | "tier3";

export type MoveChannelInput = {
  channelId: Scalars["ID"]["input"];
  groupId?: InputMaybe<Scalars["ID"]["input"]>;
  position: Scalars["Int"]["input"];
};

export type Mutation = {
  __typename?: "Mutation";
  acceptAgentSuggestion: InboxItem;
  addChatMember: Chat;
  addOrgMember: OrgMember;
  approveBridgeAccessRequest: BridgeAccessGrant;
  archiveSessionGroup?: Maybe<SessionGroup>;
  assignTicket: Ticket;
  cancelUltraplan: Ultraplan;
  clearQueuedMessages: Scalars["Boolean"]["output"];
  commentOnTicket: Event;
  commitLinkedCheckoutChanges: LinkedCheckoutActionResult;
  createAgentEnvironment: AgentEnvironment;
  createAiConversation: AiConversation;
  createChannel: Channel;
  createChannelGroup: ChannelGroup;
  createChannelTerminal: Terminal;
  createChat: Chat;
  createOrganization: OrgMember;
  createProject: Project;
  createRepo: Repo;
  createTerminal: Terminal;
  createTicket: Ticket;
  deleteAgentEnvironment: Scalars["Boolean"]["output"];
  deleteApiToken: Scalars["Boolean"]["output"];
  deleteChannel: Scalars["Boolean"]["output"];
  deleteChannelGroup: Scalars["Boolean"]["output"];
  deleteChannelMessage: Message;
  deleteChatMessage: Message;
  deleteOrgSecret: Scalars["Boolean"]["output"];
  deleteSession: Session;
  deleteSessionGroup: Scalars["Boolean"]["output"];
  denyBridgeAccessRequest: BridgeAccessRequest;
  destroyTerminal: Scalars["Boolean"]["output"];
  dismissAgentSuggestion: InboxItem;
  dismissInboxItem: InboxItem;
  dismissSession: Session;
  editChannelMessage: Message;
  editChatMessage: Message;
  joinChannel: Channel;
  leaveChannel: Channel;
  leaveChat: Chat;
  linkEntityToProject: Project;
  linkLinkedCheckoutRepo: LinkedCheckoutActionResult;
  linkTicket: Ticket;
  moveChannel: Channel;
  moveSessionToCloud: Session;
  moveSessionToRuntime: Session;
  muteScope: Participant;
  pauseUltraplan: Ultraplan;
  queueSessionMessage: QueuedMessage;
  registerPushToken: Scalars["Boolean"]["output"];
  registerRepoWebhook: Repo;
  removeOrgMember: Scalars["Boolean"]["output"];
  removeQueuedMessage: Scalars["Boolean"]["output"];
  renameChat: Chat;
  reorderChannelGroups: Array<ChannelGroup>;
  reorderChannels: Array<Channel>;
  requestBridgeAccess: BridgeAccessRequest;
  requestUltraplanHumanGate: InboxItem;
  resolveUltraplanHumanGate: InboxItem;
  restoreLinkedCheckout: LinkedCheckoutActionResult;
  resumeUltraplan: Ultraplan;
  retrySessionConnection: Session;
  retrySessionGroupSetup: SessionGroup;
  revokeBridgeAccessGrant: BridgeAccessGrant;
  runSession: Session;
  runUltraplanControllerNow: UltraplanControllerRun;
  sendChannelMessage: Message;
  sendChatMessage: Message;
  sendMessage: Event;
  sendSessionMessage: Event;
  sendTurn: Turn;
  setApiToken: ApiTokenStatus;
  setLinkedCheckoutAutoSync: LinkedCheckoutActionResult;
  setOrgSecret: OrgSecret;
  startSession: Session;
  startUltraplan: Ultraplan;
  subscribe: Participant;
  syncLinkedCheckout: LinkedCheckoutActionResult;
  terminateSession: Session;
  testAgentEnvironment: AgentEnvironmentTestResult;
  unassignTicket: Ticket;
  unlinkTicket: Ticket;
  unmuteScope: Participant;
  unregisterPushToken: Scalars["Boolean"]["output"];
  unregisterRepoWebhook: Repo;
  unsubscribe: Scalars["Boolean"]["output"];
  updateAgentEnvironment: AgentEnvironment;
  updateAgentSettings: AgentIdentity;
  updateAiConversationTitle: AiConversation;
  updateBridgeAccessGrant: BridgeAccessGrant;
  updateChannel: Channel;
  updateChannelGroup: ChannelGroup;
  updateOrgMemberRole: OrgMember;
  updateRepo: Repo;
  updateScopeAiMode: Scalars["Boolean"]["output"];
  updateSessionConfig: Session;
  updateTicket: Ticket;
};

export type MutationAcceptAgentSuggestionArgs = {
  edits?: InputMaybe<Scalars["JSON"]["input"]>;
  inboxItemId: Scalars["ID"]["input"];
};

export type MutationAddChatMemberArgs = {
  input: AddChatMemberInput;
};

export type MutationAddOrgMemberArgs = {
  organizationId: Scalars["ID"]["input"];
  role?: InputMaybe<UserRole>;
  userId: Scalars["ID"]["input"];
};

export type MutationApproveBridgeAccessRequestArgs = {
  capabilities?: InputMaybe<Array<BridgeAccessCapability>>;
  expiresAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  requestId: Scalars["ID"]["input"];
  scopeType?: InputMaybe<BridgeAccessScopeType>;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type MutationArchiveSessionGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationAssignTicketArgs = {
  ticketId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type MutationCancelUltraplanArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationClearQueuedMessagesArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type MutationCommentOnTicketArgs = {
  text: Scalars["String"]["input"];
  ticketId: Scalars["ID"]["input"];
};

export type MutationCommitLinkedCheckoutChangesArgs = {
  message?: InputMaybe<Scalars["String"]["input"]>;
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationCreateAgentEnvironmentArgs = {
  input: CreateAgentEnvironmentInput;
};

export type MutationCreateAiConversationArgs = {
  input: CreateAiConversationInput;
  organizationId: Scalars["ID"]["input"];
};

export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};

export type MutationCreateChannelGroupArgs = {
  input: CreateChannelGroupInput;
};

export type MutationCreateChannelTerminalArgs = {
  bridgeRuntimeId: Scalars["ID"]["input"];
  channelId: Scalars["ID"]["input"];
  cols: Scalars["Int"]["input"];
  rows: Scalars["Int"]["input"];
};

export type MutationCreateChatArgs = {
  input: CreateChatInput;
};

export type MutationCreateOrganizationArgs = {
  input: CreateOrganizationInput;
};

export type MutationCreateProjectArgs = {
  input: CreateProjectInput;
};

export type MutationCreateRepoArgs = {
  input: CreateRepoInput;
};

export type MutationCreateTerminalArgs = {
  cols: Scalars["Int"]["input"];
  rows: Scalars["Int"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};

export type MutationDeleteAgentEnvironmentArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteApiTokenArgs = {
  provider: ApiTokenProvider;
};

export type MutationDeleteChannelArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteChannelGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteChannelMessageArgs = {
  messageId: Scalars["ID"]["input"];
};

export type MutationDeleteChatMessageArgs = {
  messageId: Scalars["ID"]["input"];
};

export type MutationDeleteOrgSecretArgs = {
  id: Scalars["ID"]["input"];
  orgId: Scalars["ID"]["input"];
};

export type MutationDeleteSessionArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteSessionGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDenyBridgeAccessRequestArgs = {
  requestId: Scalars["ID"]["input"];
};

export type MutationDestroyTerminalArgs = {
  terminalId: Scalars["ID"]["input"];
};

export type MutationDismissAgentSuggestionArgs = {
  inboxItemId: Scalars["ID"]["input"];
};

export type MutationDismissInboxItemArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDismissSessionArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationEditChannelMessageArgs = {
  html: Scalars["String"]["input"];
  messageId: Scalars["ID"]["input"];
};

export type MutationEditChatMessageArgs = {
  html: Scalars["String"]["input"];
  messageId: Scalars["ID"]["input"];
};

export type MutationJoinChannelArgs = {
  channelId: Scalars["ID"]["input"];
};

export type MutationLeaveChannelArgs = {
  channelId: Scalars["ID"]["input"];
};

export type MutationLeaveChatArgs = {
  chatId: Scalars["ID"]["input"];
};

export type MutationLinkEntityToProjectArgs = {
  entityId: Scalars["ID"]["input"];
  entityType: EntityType;
  projectId: Scalars["ID"]["input"];
};

export type MutationLinkLinkedCheckoutRepoArgs = {
  localPath: Scalars["String"]["input"];
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationLinkTicketArgs = {
  entityId: Scalars["ID"]["input"];
  entityType: EntityType;
  ticketId: Scalars["ID"]["input"];
};

export type MutationMoveChannelArgs = {
  input: MoveChannelInput;
};

export type MutationMoveSessionToCloudArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type MutationMoveSessionToRuntimeArgs = {
  runtimeInstanceId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type MutationMuteScopeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationPauseUltraplanArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationQueueSessionMessageArgs = {
  imageKeys?: InputMaybe<Array<Scalars["String"]["input"]>>;
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  text: Scalars["String"]["input"];
};

export type MutationRegisterPushTokenArgs = {
  platform: PushPlatform;
  token: Scalars["String"]["input"];
};

export type MutationRegisterRepoWebhookArgs = {
  repoId: Scalars["ID"]["input"];
};

export type MutationRemoveOrgMemberArgs = {
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type MutationRemoveQueuedMessageArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRenameChatArgs = {
  chatId: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
};

export type MutationReorderChannelGroupsArgs = {
  input: ReorderChannelGroupsInput;
};

export type MutationReorderChannelsArgs = {
  input: ReorderChannelsInput;
};

export type MutationRequestBridgeAccessArgs = {
  requestedCapabilities?: InputMaybe<Array<BridgeAccessCapability>>;
  requestedExpiresAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  runtimeInstanceId: Scalars["ID"]["input"];
  scopeType: BridgeAccessScopeType;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type MutationRequestUltraplanHumanGateArgs = {
  input: RequestUltraplanHumanGateInput;
};

export type MutationResolveUltraplanHumanGateArgs = {
  inboxItemId: Scalars["ID"]["input"];
  resolution: UltraplanHumanGateResolution;
  response?: InputMaybe<Scalars["JSON"]["input"]>;
};

export type MutationRestoreLinkedCheckoutArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationResumeUltraplanArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRetrySessionConnectionArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type MutationRetrySessionGroupSetupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRevokeBridgeAccessGrantArgs = {
  grantId: Scalars["ID"]["input"];
};

export type MutationRunSessionArgs = {
  id: Scalars["ID"]["input"];
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  prompt?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationRunUltraplanControllerNowArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationSendChannelMessageArgs = {
  channelId: Scalars["ID"]["input"];
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  text?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationSendChatMessageArgs = {
  chatId: Scalars["ID"]["input"];
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  text?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationSendMessageArgs = {
  channelId: Scalars["ID"]["input"];
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  text: Scalars["String"]["input"];
};

export type MutationSendSessionMessageArgs = {
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  imageKeys?: InputMaybe<Array<Scalars["String"]["input"]>>;
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  text: Scalars["String"]["input"];
};

export type MutationSendTurnArgs = {
  branchId: Scalars["ID"]["input"];
  content: Scalars["String"]["input"];
};

export type MutationSetApiTokenArgs = {
  input: SetApiTokenInput;
};

export type MutationSetLinkedCheckoutAutoSyncArgs = {
  enabled: Scalars["Boolean"]["input"];
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSetOrgSecretArgs = {
  input: SetOrgSecretInput;
};

export type MutationStartSessionArgs = {
  input: StartSessionInput;
};

export type MutationStartUltraplanArgs = {
  input: StartUltraplanInput;
};

export type MutationSubscribeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationSyncLinkedCheckoutArgs = {
  autoSyncEnabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  branch: Scalars["String"]["input"];
  commitMessage?: InputMaybe<Scalars["String"]["input"]>;
  commitSha?: InputMaybe<Scalars["String"]["input"]>;
  conflictStrategy?: InputMaybe<LinkedCheckoutSyncConflictStrategy>;
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationTerminateSessionArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationTestAgentEnvironmentArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationUnassignTicketArgs = {
  ticketId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type MutationUnlinkTicketArgs = {
  entityId: Scalars["ID"]["input"];
  entityType: EntityType;
  ticketId: Scalars["ID"]["input"];
};

export type MutationUnmuteScopeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationUnregisterPushTokenArgs = {
  token: Scalars["String"]["input"];
};

export type MutationUnregisterRepoWebhookArgs = {
  repoId: Scalars["ID"]["input"];
};

export type MutationUnsubscribeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationUpdateAgentEnvironmentArgs = {
  input: UpdateAgentEnvironmentInput;
};

export type MutationUpdateAgentSettingsArgs = {
  input: UpdateAgentSettingsInput;
  organizationId: Scalars["ID"]["input"];
};

export type MutationUpdateAiConversationTitleArgs = {
  conversationId: Scalars["ID"]["input"];
  title: Scalars["String"]["input"];
};

export type MutationUpdateBridgeAccessGrantArgs = {
  capabilities: Array<BridgeAccessCapability>;
  grantId: Scalars["ID"]["input"];
};

export type MutationUpdateChannelArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateChannelInput;
};

export type MutationUpdateChannelGroupArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateChannelGroupInput;
};

export type MutationUpdateOrgMemberRoleArgs = {
  organizationId: Scalars["ID"]["input"];
  role: UserRole;
  userId: Scalars["ID"]["input"];
};

export type MutationUpdateRepoArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateRepoInput;
};

export type MutationUpdateScopeAiModeArgs = {
  aiMode?: InputMaybe<AutonomyMode>;
  organizationId: Scalars["ID"]["input"];
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationUpdateSessionConfigArgs = {
  hosting?: InputMaybe<HostingMode>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  reasoningEffort?: InputMaybe<Scalars["String"]["input"]>;
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  tool?: InputMaybe<CodingTool>;
};

export type MutationUpdateTicketArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateTicketInput;
};

export type Notification = {
  __typename?: "Notification";
  id: Scalars["ID"]["output"];
  message: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type OrgAgentStatus = "disabled" | "enabled";

export type OrgMember = {
  __typename?: "OrgMember";
  joinedAt: Scalars["DateTime"]["output"];
  organization: Organization;
  role: UserRole;
  user: User;
};

export type OrgSecret = {
  __typename?: "OrgSecret";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  orgId: Scalars["ID"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type Organization = {
  __typename?: "Organization";
  agentEnvironments: Array<AgentEnvironment>;
  channels: Array<Channel>;
  id: Scalars["ID"]["output"];
  members: Array<OrgMember>;
  name: Scalars["String"]["output"];
  projects: Array<Project>;
  repos: Array<Repo>;
};

export type Participant = {
  __typename?: "Participant";
  muted: Scalars["Boolean"]["output"];
  scopeId: Scalars["ID"]["output"];
  scopeType: Scalars["String"]["output"];
  subscribedAt: Scalars["DateTime"]["output"];
  user: User;
  userId: Scalars["ID"]["output"];
};

export type PortEndpoint = {
  __typename?: "PortEndpoint";
  label: Scalars["String"]["output"];
  port: Scalars["Int"]["output"];
  status: Scalars["String"]["output"];
  url: Scalars["String"]["output"];
};

export type Priority = "high" | "low" | "medium" | "urgent";

export type Project = {
  __typename?: "Project";
  aiMode?: Maybe<AutonomyMode>;
  channels: Array<Channel>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  tickets: Array<Ticket>;
};

export type PushPlatform = "android" | "ios";

export type Query = {
  __typename?: "Query";
  agentAggregationWindows: Array<AggregationWindowInfo>;
  agentCostSummary: AgentCostSummary;
  agentEnvironments: Array<AgentEnvironment>;
  agentExecutionLog?: Maybe<AgentExecutionLog>;
  agentExecutionLogs: AgentExecutionLogConnection;
  agentIdentity?: Maybe<AgentIdentity>;
  agentWorkerStatus: AgentWorkerStatus;
  aiConversation?: Maybe<AiConversation>;
  aiConversations: Array<AiConversation>;
  availableRuntimes: Array<SessionRuntimeInstance>;
  availableSessionRuntimes: Array<SessionRuntimeInstance>;
  branch?: Maybe<Branch>;
  bridgeRuntimeAccess: BridgeRuntimeAccess;
  channel?: Maybe<Channel>;
  channelGroups: Array<ChannelGroup>;
  channelMessages: Array<Message>;
  channelTerminals: Array<Terminal>;
  channels: Array<Channel>;
  chat?: Maybe<Chat>;
  chatMessages: Array<Message>;
  chats: Array<Chat>;
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
  linkedCheckoutStatus: LinkedCheckoutStatus;
  myApiTokens: Array<ApiTokenStatus>;
  myBridgeRuntimes: Array<BridgeRuntime>;
  myConnections: Array<ConnectionsBridge>;
  myOrganizations: Array<OrgMember>;
  mySessions: Array<Session>;
  orgSecrets: Array<OrgSecret>;
  organization?: Maybe<Organization>;
  participants: Array<Participant>;
  project?: Maybe<Project>;
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  repoBranches: Array<Scalars["String"]["output"]>;
  repos: Array<Repo>;
  resolvedAiMode: AutonomyMode;
  searchSessions: SessionSearchResults;
  searchUsers: Array<User>;
  session?: Maybe<Session>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupBranchDiff: Array<BranchDiffFile>;
  sessionGroupFileAtRef: Scalars["String"]["output"];
  sessionGroupFileContent: Scalars["String"]["output"];
  sessionGroupFiles: Array<Scalars["String"]["output"]>;
  sessionGroups: Array<SessionGroup>;
  sessionSlashCommands: Array<SlashCommand>;
  sessionTerminals: Array<Terminal>;
  sessions: Array<Session>;
  threadReplies: Array<Message>;
  threadSummary?: Maybe<ThreadSummary>;
  ticket?: Maybe<Ticket>;
  tickets: Array<Ticket>;
  ultraplan?: Maybe<Ultraplan>;
  ultraplanControllerRun?: Maybe<UltraplanControllerRun>;
  ultraplanForSessionGroup?: Maybe<Ultraplan>;
};

export type QueryAgentAggregationWindowsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryAgentCostSummaryArgs = {
  endDate: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  startDate: Scalars["String"]["input"];
};

export type QueryAgentEnvironmentsArgs = {
  orgId: Scalars["ID"]["input"];
};

export type QueryAgentExecutionLogArgs = {
  id: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
};

export type QueryAgentExecutionLogsArgs = {
  filters?: InputMaybe<ExecutionLogFilters>;
  organizationId: Scalars["ID"]["input"];
};

export type QueryAgentIdentityArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryAgentWorkerStatusArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryAiConversationArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryAiConversationsArgs = {
  organizationId: Scalars["ID"]["input"];
  visibility?: InputMaybe<AiConversationVisibility>;
};

export type QueryAvailableRuntimesArgs = {
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
  tool: CodingTool;
};

export type QueryAvailableSessionRuntimesArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type QueryBranchArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryBridgeRuntimeAccessArgs = {
  runtimeInstanceId: Scalars["ID"]["input"];
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryChannelArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryChannelGroupsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryChannelMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  channelId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryChannelTerminalsArgs = {
  bridgeRuntimeId: Scalars["ID"]["input"];
  channelId: Scalars["ID"]["input"];
};

export type QueryChannelsArgs = {
  memberOnly?: InputMaybe<Scalars["Boolean"]["input"]>;
  organizationId: Scalars["ID"]["input"];
  projectId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryChatArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryChatMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  chatId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryEventsArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]>>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  organizationId: Scalars["ID"]["input"];
  scope?: InputMaybe<ScopeInput>;
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type QueryInboxItemsArgs = {
  organizationId: Scalars["ID"]["input"];
  status?: InputMaybe<InboxItemStatus>;
};

export type QueryLinkedCheckoutStatusArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueryMySessionsArgs = {
  agentStatus?: InputMaybe<AgentStatus>;
  includeArchived?: InputMaybe<Scalars["Boolean"]["input"]>;
  includeMerged?: InputMaybe<Scalars["Boolean"]["input"]>;
  organizationId: Scalars["ID"]["input"];
};

export type QueryOrgSecretsArgs = {
  orgId: Scalars["ID"]["input"];
};

export type QueryOrganizationArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryParticipantsArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type QueryProjectArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryProjectsArgs = {
  organizationId: Scalars["ID"]["input"];
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryRepoArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryRepoBranchesArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryReposArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryResolvedAiModeArgs = {
  organizationId: Scalars["ID"]["input"];
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type QuerySearchSessionsArgs = {
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  query: Scalars["String"]["input"];
};

export type QuerySearchUsersArgs = {
  query: Scalars["String"]["input"];
};

export type QuerySessionArgs = {
  id: Scalars["ID"]["input"];
};

export type QuerySessionGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type QuerySessionGroupBranchDiffArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFileAtRefArgs = {
  filePath: Scalars["String"]["input"];
  ref: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFileContentArgs = {
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFilesArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupsArgs = {
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
  channelId: Scalars["ID"]["input"];
  status?: InputMaybe<SessionGroupStatus>;
};

export type QuerySessionSlashCommandsArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionTerminalsArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionsArgs = {
  filters?: InputMaybe<SessionFilters>;
  organizationId: Scalars["ID"]["input"];
};

export type QueryThreadRepliesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  rootMessageId: Scalars["ID"]["input"];
};

export type QueryThreadSummaryArgs = {
  rootMessageId: Scalars["ID"]["input"];
};

export type QueryTicketArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryTicketsArgs = {
  filters?: InputMaybe<TicketFilters>;
  organizationId: Scalars["ID"]["input"];
};

export type QueryUltraplanArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryUltraplanControllerRunArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryUltraplanForSessionGroupArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueuedMessage = {
  __typename?: "QueuedMessage";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  imageKeys: Array<Scalars["String"]["output"]>;
  interactionMode?: Maybe<Scalars["String"]["output"]>;
  position: Scalars["Int"]["output"];
  sessionId: Scalars["ID"]["output"];
  text: Scalars["String"]["output"];
};

export type ReorderChannelGroupsInput = {
  groupIds: Array<Scalars["ID"]["input"]>;
  organizationId: Scalars["ID"]["input"];
};

export type ReorderChannelsInput = {
  channelIds: Array<Scalars["ID"]["input"]>;
  groupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type Repo = {
  __typename?: "Repo";
  defaultBranch: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  projects: Array<Project>;
  remoteUrl: Scalars["String"]["output"];
  sessions: Array<Session>;
  webhookActive: Scalars["Boolean"]["output"];
};

export type RequestUltraplanHumanGateInput = {
  branchName?: InputMaybe<Scalars["String"]["input"]>;
  checkpointSha?: InputMaybe<Scalars["String"]["input"]>;
  controllerRunId?: InputMaybe<Scalars["ID"]["input"]>;
  controllerRunSessionId?: InputMaybe<Scalars["ID"]["input"]>;
  controllerRunUrl?: InputMaybe<Scalars["String"]["input"]>;
  diffUrl?: InputMaybe<Scalars["String"]["input"]>;
  gateReason?: InputMaybe<Scalars["String"]["input"]>;
  itemType: InboxItemType;
  payload?: InputMaybe<Scalars["JSON"]["input"]>;
  prUrl?: InputMaybe<Scalars["String"]["input"]>;
  qaChecklist?: InputMaybe<Array<Scalars["String"]["input"]>>;
  recommendedAction?: InputMaybe<Scalars["String"]["input"]>;
  summary?: InputMaybe<Scalars["String"]["input"]>;
  ticketExecutionId?: InputMaybe<Scalars["ID"]["input"]>;
  ticketId?: InputMaybe<Scalars["ID"]["input"]>;
  title: Scalars["String"]["input"];
  ultraplanId: Scalars["ID"]["input"];
  workerSessionId?: InputMaybe<Scalars["ID"]["input"]>;
  workerSessionUrl?: InputMaybe<Scalars["String"]["input"]>;
};

export type ScopeInput = {
  id: Scalars["ID"]["input"];
  type: ScopeType;
};

export type ScopeType = "channel" | "chat" | "session" | "system" | "ticket" | "ultraplan";

export type Session = {
  __typename?: "Session";
  agentStatus: AgentStatus;
  branch?: Maybe<Scalars["String"]["output"]>;
  channel?: Maybe<Channel>;
  connection?: Maybe<SessionConnection>;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  endpoints?: Maybe<SessionEndpoints>;
  gitCheckpoints: Array<GitCheckpoint>;
  hosting: HostingMode;
  id: Scalars["ID"]["output"];
  lastMessageAt?: Maybe<Scalars["DateTime"]["output"]>;
  lastUserMessageAt?: Maybe<Scalars["DateTime"]["output"]>;
  model?: Maybe<Scalars["String"]["output"]>;
  name: Scalars["String"]["output"];
  prUrl?: Maybe<Scalars["String"]["output"]>;
  projects: Array<Project>;
  queuedMessages: Array<QueuedMessage>;
  reasoningEffort?: Maybe<Scalars["String"]["output"]>;
  repo?: Maybe<Repo>;
  role: SessionRole;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  sessionStatus: SessionStatus;
  tickets: Array<Ticket>;
  tool: CodingTool;
  toolSessionId?: Maybe<Scalars["String"]["output"]>;
  updatedAt: Scalars["DateTime"]["output"];
  workdir?: Maybe<Scalars["String"]["output"]>;
  worktreeDeleted: Scalars["Boolean"]["output"];
};

export type SessionConnection = {
  __typename?: "SessionConnection";
  adapterType?: Maybe<Scalars["String"]["output"]>;
  /**
   * When false, the frontend should not auto-retry the connection — only manual
   * Retry/Move can unblock. Used for non-transient failures like the home bridge
   * being offline, where repeated retries produce noise without progress.
   */
  autoRetryable?: Maybe<Scalars["Boolean"]["output"]>;
  canMove: Scalars["Boolean"]["output"];
  canRetry: Scalars["Boolean"]["output"];
  connectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  connectingAt?: Maybe<Scalars["DateTime"]["output"]>;
  disconnectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  environmentId?: Maybe<Scalars["String"]["output"]>;
  failedAt?: Maybe<Scalars["DateTime"]["output"]>;
  lastDeliveryFailureAt?: Maybe<Scalars["DateTime"]["output"]>;
  lastError?: Maybe<Scalars["String"]["output"]>;
  lastSeen?: Maybe<Scalars["DateTime"]["output"]>;
  providerRuntimeId?: Maybe<Scalars["String"]["output"]>;
  providerRuntimeUrl?: Maybe<Scalars["String"]["output"]>;
  provisioningAt?: Maybe<Scalars["DateTime"]["output"]>;
  reconnectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  requestedAt?: Maybe<Scalars["DateTime"]["output"]>;
  retryCount: Scalars["Int"]["output"];
  runtimeInstanceId?: Maybe<Scalars["String"]["output"]>;
  runtimeLabel?: Maybe<Scalars["String"]["output"]>;
  state: SessionConnectionState;
  stoppedAt?: Maybe<Scalars["DateTime"]["output"]>;
  stoppingAt?: Maybe<Scalars["DateTime"]["output"]>;
  timedOutAt?: Maybe<Scalars["DateTime"]["output"]>;
};

export type SessionConnectionState =
  | "booting"
  | "connected"
  | "connecting"
  | "degraded"
  | "deprovision_failed"
  | "deprovisioned"
  | "disconnected"
  | "failed"
  | "pending"
  | "provisioning"
  | "requested"
  | "stopped"
  | "stopping"
  | "timed_out";

export type SessionEndpoints = {
  __typename?: "SessionEndpoints";
  ports: Array<PortEndpoint>;
  terminals: Array<TerminalEndpoint>;
};

export type SessionFilters = {
  agentStatus?: InputMaybe<AgentStatus>;
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
  tool?: InputMaybe<CodingTool>;
};

export type SessionGroup = {
  __typename?: "SessionGroup";
  archivedAt?: Maybe<Scalars["DateTime"]["output"]>;
  branch?: Maybe<Scalars["String"]["output"]>;
  channel?: Maybe<Channel>;
  connection?: Maybe<SessionConnection>;
  createdAt: Scalars["DateTime"]["output"];
  gitCheckpoints: Array<GitCheckpoint>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  prUrl?: Maybe<Scalars["String"]["output"]>;
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  setupError?: Maybe<Scalars["String"]["output"]>;
  setupStatus: SetupStatus;
  slug?: Maybe<Scalars["String"]["output"]>;
  status: SessionGroupStatus;
  ultraplan?: Maybe<Ultraplan>;
  updatedAt: Scalars["DateTime"]["output"];
  workdir?: Maybe<Scalars["String"]["output"]>;
  worktreeDeleted: Scalars["Boolean"]["output"];
};

export type SessionGroupStatus =
  | "archived"
  | "failed"
  | "in_progress"
  | "in_review"
  | "merged"
  | "needs_input"
  | "stopped";

export type SessionRole = "primary" | "ticket_worker" | "ultraplan_controller_run";

export type SessionRuntimeInstance = {
  __typename?: "SessionRuntimeInstance";
  access: BridgeRuntimeAccess;
  connected: Scalars["Boolean"]["output"];
  hostingMode: HostingMode;
  id: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  registeredRepoIds: Array<Scalars["ID"]["output"]>;
  sessionCount: Scalars["Int"]["output"];
  supportedTools: Array<CodingTool>;
};

export type SessionSearchResults = {
  __typename?: "SessionSearchResults";
  sessionGroups: Array<SessionGroup>;
  sessions: Array<Session>;
};

export type SessionStatus = "in_progress" | "in_review" | "merged" | "needs_input";

export type SetApiTokenInput = {
  provider: ApiTokenProvider;
  token: Scalars["String"]["input"];
};

export type SetOrgSecretInput = {
  name: Scalars["String"]["input"];
  orgId: Scalars["ID"]["input"];
  value: Scalars["String"]["input"];
};

export type SetupStatus = "completed" | "failed" | "idle" | "running";

export type SlashCommand = {
  __typename?: "SlashCommand";
  category: SlashCommandCategory;
  description: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  source: SlashCommandSource;
};

export type SlashCommandCategory = "passthrough" | "special" | "terminal";

export type SlashCommandSource = "builtin" | "project_skill" | "user_skill";

export type StartSessionInput = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  deferRuntimeSelection?: InputMaybe<Scalars["Boolean"]["input"]>;
  environmentId?: InputMaybe<Scalars["ID"]["input"]>;
  hosting?: InputMaybe<HostingMode>;
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  projectId?: InputMaybe<Scalars["ID"]["input"]>;
  prompt?: InputMaybe<Scalars["String"]["input"]>;
  reasoningEffort?: InputMaybe<Scalars["String"]["input"]>;
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
  restoreCheckpointId?: InputMaybe<Scalars["ID"]["input"]>;
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
  sourceSessionId?: InputMaybe<Scalars["ID"]["input"]>;
  ticketId?: InputMaybe<Scalars["ID"]["input"]>;
  tool: CodingTool;
};

export type StartUltraplanInput = {
  controllerModel?: InputMaybe<Scalars["String"]["input"]>;
  controllerProvider: Scalars["String"]["input"];
  controllerRuntimePolicy?: InputMaybe<Scalars["JSON"]["input"]>;
  customInstructions?: InputMaybe<Scalars["String"]["input"]>;
  goal: Scalars["String"]["input"];
  playbookConfig?: InputMaybe<Scalars["JSON"]["input"]>;
  playbookId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type Subscription = {
  __typename?: "Subscription";
  branchTurns: Turn;
  channelEvents: Event;
  chatEvents: Event;
  conversationEvents: AiConversationEvent;
  orgEvents: Event;
  sessionEvents: Event;
  sessionPortsChanged: SessionEndpoints;
  sessionStatusChanged: Session;
  ticketEvents: Event;
  userNotifications: Notification;
};

export type SubscriptionBranchTurnsArgs = {
  branchId: Scalars["ID"]["input"];
};

export type SubscriptionChannelEventsArgs = {
  channelId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type SubscriptionChatEventsArgs = {
  chatId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type SubscriptionConversationEventsArgs = {
  conversationId: Scalars["ID"]["input"];
};

export type SubscriptionOrgEventsArgs = {
  organizationId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type SubscriptionSessionEventsArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type SubscriptionSessionPortsChangedArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type SubscriptionSessionStatusChangedArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type SubscriptionTicketEventsArgs = {
  organizationId: Scalars["ID"]["input"];
  ticketId: Scalars["ID"]["input"];
};

export type SubscriptionUserNotificationsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type Terminal = {
  __typename?: "Terminal";
  id: Scalars["ID"]["output"];
  sessionId: Scalars["ID"]["output"];
};

export type TerminalEndpoint = {
  __typename?: "TerminalEndpoint";
  id: Scalars["String"]["output"];
  status: Scalars["String"]["output"];
  wsUrl: Scalars["String"]["output"];
};

export type ThreadSummary = {
  __typename?: "ThreadSummary";
  lastReplyAt?: Maybe<Scalars["DateTime"]["output"]>;
  participantIds: Array<Scalars["ID"]["output"]>;
  replyCount: Scalars["Int"]["output"];
  rootMessageId: Scalars["ID"]["output"];
};

export type Ticket = {
  __typename?: "Ticket";
  acceptanceCriteria: Array<Scalars["String"]["output"]>;
  aiMode?: Maybe<AutonomyMode>;
  assignees: Array<User>;
  channel?: Maybe<Channel>;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  dependedOnBy: Array<TicketDependency>;
  dependencies: Array<TicketDependency>;
  description: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  labels: Array<Scalars["String"]["output"]>;
  links: Array<TicketLink>;
  origin?: Maybe<Event>;
  priority: Priority;
  projects: Array<Project>;
  sessions: Array<Session>;
  status: TicketStatus;
  testPlan?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type TicketDependency = {
  __typename?: "TicketDependency";
  createdAt: Scalars["DateTime"]["output"];
  dependsOnTicket: Ticket;
  dependsOnTicketId: Scalars["ID"]["output"];
  organizationId: Scalars["ID"]["output"];
  reason?: Maybe<Scalars["String"]["output"]>;
  ticket: Ticket;
  ticketId: Scalars["ID"]["output"];
};

export type TicketExecution = {
  __typename?: "TicketExecution";
  activeInboxItem?: Maybe<InboxItem>;
  activeInboxItemId?: Maybe<Scalars["ID"]["output"]>;
  attempt: Scalars["Int"]["output"];
  baseCheckpointSha?: Maybe<Scalars["String"]["output"]>;
  branch: Scalars["String"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  headCheckpointSha?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  integrationCheckpointSha?: Maybe<Scalars["String"]["output"]>;
  integrationStatus: IntegrationStatus;
  lastReviewSummary?: Maybe<Scalars["String"]["output"]>;
  organizationId: Scalars["ID"]["output"];
  sessionGroup: SessionGroup;
  sessionGroupId: Scalars["ID"]["output"];
  status: TicketExecutionStatus;
  ticket: Ticket;
  ticketId: Scalars["ID"]["output"];
  ultraplan: Ultraplan;
  ultraplanId: Scalars["ID"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
  workdir?: Maybe<Scalars["String"]["output"]>;
  workerSession?: Maybe<Session>;
  workerSessionId?: Maybe<Scalars["ID"]["output"]>;
};

export type TicketExecutionStatus =
  | "blocked"
  | "cancelled"
  | "failed"
  | "integrated"
  | "integrating"
  | "needs_human"
  | "queued"
  | "ready_to_integrate"
  | "reviewing"
  | "running";

export type TicketFilters = {
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
};

export type TicketLink = {
  __typename?: "TicketLink";
  createdAt: Scalars["DateTime"]["output"];
  entityId: Scalars["ID"]["output"];
  entityType: EntityType;
  id: Scalars["ID"]["output"];
};

export type TicketStatus = "backlog" | "cancelled" | "done" | "in_progress" | "in_review" | "todo";

export type Turn = {
  __typename?: "Turn";
  branch: Branch;
  branchCount: Scalars["Int"]["output"];
  childBranches: Array<Branch>;
  content: Scalars["String"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  parentTurn?: Maybe<Turn>;
  role: TurnRole;
};

export type TurnRole = "ASSISTANT" | "USER";

export type UpdateAgentEnvironmentInput = {
  adapterType?: InputMaybe<AgentEnvironmentAdapterType>;
  config?: InputMaybe<Scalars["JSON"]["input"]>;
  enabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  id: Scalars["ID"]["input"];
  isDefault?: InputMaybe<Scalars["Boolean"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type Ultraplan = {
  __typename?: "Ultraplan";
  activeInboxItem?: Maybe<InboxItem>;
  activeInboxItemId?: Maybe<Scalars["ID"]["output"]>;
  controllerRuns: Array<UltraplanControllerRun>;
  createdAt: Scalars["DateTime"]["output"];
  customInstructions?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  integrationBranch: Scalars["String"]["output"];
  integrationWorkdir?: Maybe<Scalars["String"]["output"]>;
  lastControllerRun?: Maybe<UltraplanControllerRun>;
  lastControllerRunId?: Maybe<Scalars["ID"]["output"]>;
  lastControllerSummary?: Maybe<Scalars["String"]["output"]>;
  organizationId: Scalars["ID"]["output"];
  ownerUser: User;
  ownerUserId: Scalars["ID"]["output"];
  planSummary?: Maybe<Scalars["String"]["output"]>;
  playbookConfig?: Maybe<Scalars["JSON"]["output"]>;
  playbookId?: Maybe<Scalars["ID"]["output"]>;
  sessionGroup: SessionGroup;
  sessionGroupId: Scalars["ID"]["output"];
  status: UltraplanStatus;
  ticketExecutions: Array<TicketExecution>;
  tickets: Array<UltraplanTicket>;
  updatedAt: Scalars["DateTime"]["output"];
};

export type UltraplanControllerRun = {
  __typename?: "UltraplanControllerRun";
  completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  error?: Maybe<Scalars["String"]["output"]>;
  generatedTickets: Array<UltraplanTicket>;
  id: Scalars["ID"]["output"];
  inputSummary?: Maybe<Scalars["String"]["output"]>;
  organizationId: Scalars["ID"]["output"];
  session?: Maybe<Session>;
  sessionGroup: SessionGroup;
  sessionGroupId: Scalars["ID"]["output"];
  sessionId?: Maybe<Scalars["ID"]["output"]>;
  startedAt?: Maybe<Scalars["DateTime"]["output"]>;
  status: ControllerRunStatus;
  summary?: Maybe<Scalars["String"]["output"]>;
  summaryPayload?: Maybe<Scalars["JSON"]["output"]>;
  summaryTitle?: Maybe<Scalars["String"]["output"]>;
  triggerEvent?: Maybe<Event>;
  triggerEventId?: Maybe<Scalars["ID"]["output"]>;
  triggerType: Scalars["String"]["output"];
  ultraplan: Ultraplan;
  ultraplanId: Scalars["ID"]["output"];
};

export type UltraplanHumanGateResolution =
  | "approved"
  | "blocked"
  | "cancelled"
  | "changes_requested"
  | "dismissed"
  | "resolved";

export type UltraplanStatus =
  | "cancelled"
  | "completed"
  | "draft"
  | "failed"
  | "integrating"
  | "needs_human"
  | "paused"
  | "planning"
  | "running"
  | "waiting";

export type UltraplanTicket = {
  __typename?: "UltraplanTicket";
  createdAt: Scalars["DateTime"]["output"];
  generatedByRun?: Maybe<UltraplanControllerRun>;
  generatedByRunId?: Maybe<Scalars["ID"]["output"]>;
  id: Scalars["ID"]["output"];
  metadata?: Maybe<Scalars["JSON"]["output"]>;
  organizationId: Scalars["ID"]["output"];
  position: Scalars["Int"]["output"];
  rationale?: Maybe<Scalars["String"]["output"]>;
  status: UltraplanTicketStatus;
  ticket: Ticket;
  ticketId: Scalars["ID"]["output"];
  ultraplan: Ultraplan;
  ultraplanId: Scalars["ID"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type UltraplanTicketStatus =
  | "blocked"
  | "cancelled"
  | "completed"
  | "planned"
  | "ready"
  | "running"
  | "skipped";

export type UpdateAgentSettingsInput = {
  autonomyMode?: InputMaybe<AutonomyMode>;
  dailyLimitCents?: InputMaybe<Scalars["Int"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  soulFile?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<OrgAgentStatus>;
};

export type UpdateChannelGroupInput = {
  isCollapsed?: InputMaybe<Scalars["Boolean"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  position?: InputMaybe<Scalars["Int"]["input"]>;
};

export type UpdateChannelInput = {
  baseBranch?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  runScripts?: InputMaybe<Scalars["JSON"]["input"]>;
  setupScript?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateRepoInput = {
  defaultBranch?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateTicketInput = {
  acceptanceCriteria?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dependencyTicketIds?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  labels?: InputMaybe<Array<Scalars["String"]["input"]>>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
  testPlan?: InputMaybe<Scalars["String"]["input"]>;
  title?: InputMaybe<Scalars["String"]["input"]>;
};

export type User = {
  __typename?: "User";
  avatarUrl?: Maybe<Scalars["String"]["output"]>;
  email: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  organizations: Array<OrgMember>;
};

export type UserRole = "admin" | "member" | "observer";

export type AgentIdentityDebugQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type AgentIdentityDebugQuery = {
  __typename?: "Query";
  agentIdentity?: {
    __typename?: "AgentIdentity";
    id: string;
    name: string;
    status: OrgAgentStatus;
    autonomyMode: AutonomyMode;
    soulFile: string;
    costBudget: { __typename?: "CostBudget"; dailyLimitCents: number };
  } | null;
};

export type UpdateAgentSettingsDebugMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  input: UpdateAgentSettingsInput;
}>;

export type UpdateAgentSettingsDebugMutation = {
  __typename?: "Mutation";
  updateAgentSettings: {
    __typename?: "AgentIdentity";
    id: string;
    name: string;
    status: OrgAgentStatus;
    autonomyMode: AutonomyMode;
    soulFile: string;
    costBudget: { __typename?: "CostBudget"; dailyLimitCents: number };
  };
};

export type AgentCostSummaryQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  startDate: Scalars["String"]["input"];
  endDate: Scalars["String"]["input"];
}>;

export type AgentCostSummaryQuery = {
  __typename?: "Query";
  agentCostSummary: {
    __typename?: "AgentCostSummary";
    budget: {
      __typename?: "AgentBudgetStatus";
      dailyLimitCents: number;
      spentCents: number;
      remainingCents: number;
      remainingPercent: number;
    };
    dailyCosts: Array<{
      __typename?: "AgentCostEntry";
      date: string;
      totalCostCents: number;
      tier2Calls: number;
      tier2CostCents: number;
      tier3Calls: number;
      tier3CostCents: number;
      summaryCalls: number;
      summaryCostCents: number;
    }>;
  };
};

export type AgentExecutionLogDetailQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  id: Scalars["ID"]["input"];
}>;

export type AgentExecutionLogDetailQuery = {
  __typename?: "Query";
  agentExecutionLog?: {
    __typename?: "AgentExecutionLog";
    id: string;
    organizationId: string;
    triggerEventId: string;
    batchSize: number;
    agentId: string;
    modelTier: ModelTier;
    model: string;
    promoted: boolean;
    promotionReason?: string | null;
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
    contextTokenAllocation?: JsonValue | null;
    disposition: ExecutionDisposition;
    confidence: number;
    plannedActions?: JsonValue | null;
    policyDecision?: JsonValue | null;
    finalActions?: JsonValue | null;
    status: ExecutionStatus;
    inboxItemId?: string | null;
    latencyMs: number;
    createdAt: string;
    llmCalls: Array<{
      __typename?: "AgentLlmCall";
      id: string;
      executionLogId: string;
      turnNumber: number;
      model: string;
      provider: string;
      systemPrompt?: string | null;
      messages: JsonValue;
      tools: JsonValue;
      maxTokens?: number | null;
      temperature?: number | null;
      responseContent: JsonValue;
      stopReason: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostCents: number;
      latencyMs: number;
      createdAt: string;
    }>;
  } | null;
};

export type AgentExecutionLogsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  filters?: InputMaybe<ExecutionLogFilters>;
}>;

export type AgentExecutionLogsQuery = {
  __typename?: "Query";
  agentExecutionLogs: {
    __typename?: "AgentExecutionLogConnection";
    totalCount: number;
    items: Array<{
      __typename?: "AgentExecutionLog";
      id: string;
      triggerEventId: string;
      batchSize: number;
      agentId: string;
      modelTier: ModelTier;
      model: string;
      promoted: boolean;
      promotionReason?: string | null;
      inputTokens: number;
      outputTokens: number;
      estimatedCostCents: number;
      disposition: ExecutionDisposition;
      confidence: number;
      status: ExecutionStatus;
      latencyMs: number;
      createdAt: string;
    }>;
  };
};

export type AgentWorkerStatusQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type AgentWorkerStatusQuery = {
  __typename?: "Query";
  agentWorkerStatus: {
    __typename?: "AgentWorkerStatus";
    running: boolean;
    uptime?: number | null;
    openAggregationWindows: number;
    activeOrganizations: number;
  };
  agentAggregationWindows: Array<{
    __typename?: "AggregationWindowInfo";
    scopeKey: string;
    eventCount: number;
    openedAt: string;
    lastEventAt: string;
  }>;
};

export type SendChannelMessageMutationVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
}>;

export type SendChannelMessageMutation = {
  __typename?: "Mutation";
  sendChannelMessage: { __typename?: "Message"; id: string };
};

export type SessionGroupsQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
}>;

export type SessionGroupsQuery = {
  __typename?: "Query";
  sessionGroups: Array<{
    __typename?: "SessionGroup";
    id: string;
    name: string;
    slug?: string | null;
    status: SessionGroupStatus;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    archivedAt?: string | null;
    setupStatus: SetupStatus;
    setupError?: string | null;
    createdAt: string;
    updatedAt: string;
    channel?: { __typename?: "Channel"; id: string } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      role: SessionRole;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      prUrl?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      lastMessageAt?: string | null;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  }>;
};

export type FilteredSessionGroupsQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
  status?: InputMaybe<SessionGroupStatus>;
}>;

export type FilteredSessionGroupsQuery = {
  __typename?: "Query";
  sessionGroups: Array<{
    __typename?: "SessionGroup";
    id: string;
    name: string;
    status: SessionGroupStatus;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    archivedAt?: string | null;
    setupStatus: SetupStatus;
    setupError?: string | null;
    createdAt: string;
    updatedAt: string;
    channel?: { __typename?: "Channel"; id: string } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      role: SessionRole;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      prUrl?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      lastMessageAt?: string | null;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  }>;
};

export type AddChatMemberMutationVariables = Exact<{
  input: AddChatMemberInput;
}>;

export type AddChatMemberMutation = {
  __typename?: "Mutation";
  addChatMember: { __typename?: "Chat"; id: string };
};

export type SendChatMessageMutationVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type SendChatMessageMutation = {
  __typename?: "Mutation";
  sendChatMessage: { __typename?: "Message"; id: string };
};

export type RenameChatMutationVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
}>;

export type RenameChatMutation = {
  __typename?: "Mutation";
  renameChat: { __typename?: "Chat"; id: string; name?: string | null };
};

export type ThreadRepliesQueryVariables = Exact<{
  rootMessageId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type ThreadRepliesQuery = {
  __typename?: "Query";
  threadReplies: Array<{
    __typename?: "Message";
    id: string;
    chatId?: string | null;
    channelId?: string | null;
    text: string;
    html?: string | null;
    mentions?: JsonValue | null;
    parentMessageId?: string | null;
    replyCount: number;
    latestReplyAt?: string | null;
    createdAt: string;
    updatedAt: string;
    editedAt?: string | null;
    deletedAt?: string | null;
    threadRepliers: Array<{
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    }>;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type SessionGroupBranchDiffQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupBranchDiffQuery = {
  __typename?: "Query";
  sessionGroupBranchDiff: Array<{
    __typename?: "BranchDiffFile";
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
};

export type SessionGroupFilesQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupFilesQuery = { __typename?: "Query"; sessionGroupFiles: Array<string> };

export type SessionGroupFileAtRefQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
  ref: Scalars["String"]["input"];
}>;

export type SessionGroupFileAtRefQuery = { __typename?: "Query"; sessionGroupFileAtRef: string };

export type SessionGroupFileContentForDiffQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
}>;

export type SessionGroupFileContentForDiffQuery = {
  __typename?: "Query";
  sessionGroupFileContent: string;
};

export type SessionGroupFileContentQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
}>;

export type SessionGroupFileContentQuery = {
  __typename?: "Query";
  sessionGroupFileContent: string;
};

export type SessionDetailQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type SessionDetailQuery = {
  __typename?: "Query";
  session?: {
    __typename?: "Session";
    id: string;
    name: string;
    agentStatus: AgentStatus;
    sessionStatus: SessionStatus;
    role: SessionRole;
    tool: CodingTool;
    model?: string | null;
    reasoningEffort?: string | null;
    hosting: HostingMode;
    branch?: string | null;
    workdir?: string | null;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    lastUserMessageAt?: string | null;
    lastMessageAt?: string | null;
    sessionGroupId?: string | null;
    createdAt: string;
    updatedAt: string;
    repo?: { __typename?: "Repo"; id: string; name: string } | null;
    connection?: {
      __typename?: "SessionConnection";
      state: SessionConnectionState;
      runtimeInstanceId?: string | null;
      runtimeLabel?: string | null;
      lastError?: string | null;
      retryCount: number;
      canRetry: boolean;
      canMove: boolean;
      autoRetryable?: boolean | null;
    } | null;
    createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    sessionGroup?: {
      __typename?: "SessionGroup";
      id: string;
      name: string;
      branch?: string | null;
      prUrl?: string | null;
      workdir?: string | null;
      worktreeDeleted: boolean;
      createdAt: string;
      updatedAt: string;
      setupStatus: SetupStatus;
      setupError?: string | null;
      gitCheckpoints: Array<{
        __typename?: "GitCheckpoint";
        id: string;
        sessionId: string;
        promptEventId: string;
        commitSha: string;
        subject: string;
        author: string;
        committedAt: string;
        filesChanged: number;
        createdAt: string;
      }>;
      channel?: { __typename?: "Channel"; id: string } | null;
      repo?: { __typename?: "Repo"; id: string; name: string } | null;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
    } | null;
    gitCheckpoints: Array<{
      __typename?: "GitCheckpoint";
      id: string;
      sessionId: string;
      promptEventId: string;
      commitSha: string;
      subject: string;
      author: string;
      committedAt: string;
      filesChanged: number;
      createdAt: string;
    }>;
    channel?: { __typename?: "Channel"; id: string } | null;
    queuedMessages: Array<{
      __typename?: "QueuedMessage";
      id: string;
      sessionId: string;
      text: string;
      imageKeys: Array<string>;
      interactionMode?: string | null;
      position: number;
      createdAt: string;
    }>;
  } | null;
};

export type SessionGroupDetailQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type SessionGroupDetailQuery = {
  __typename?: "Query";
  sessionGroup?: {
    __typename?: "SessionGroup";
    id: string;
    name: string;
    slug?: string | null;
    status: SessionGroupStatus;
    archivedAt?: string | null;
    branch?: string | null;
    prUrl?: string | null;
    workdir?: string | null;
    worktreeDeleted: boolean;
    setupStatus: SetupStatus;
    setupError?: string | null;
    createdAt: string;
    updatedAt: string;
    gitCheckpoints: Array<{
      __typename?: "GitCheckpoint";
      id: string;
      sessionId: string;
      promptEventId: string;
      commitSha: string;
      subject: string;
      author: string;
      committedAt: string;
      filesChanged: number;
      createdAt: string;
    }>;
    repo?: { __typename?: "Repo"; id: string; name: string; defaultBranch: string } | null;
    connection?: {
      __typename?: "SessionConnection";
      state: SessionConnectionState;
      runtimeInstanceId?: string | null;
      runtimeLabel?: string | null;
      lastError?: string | null;
      retryCount: number;
      canRetry: boolean;
      canMove: boolean;
      autoRetryable?: boolean | null;
    } | null;
    channel?: { __typename?: "Channel"; id: string } | null;
    ultraplan?: {
      __typename?: "Ultraplan";
      id: string;
      status: UltraplanStatus;
      planSummary?: string | null;
      lastControllerSummary?: string | null;
      activeInboxItemId?: string | null;
      integrationBranch: string;
      updatedAt: string;
      tickets: Array<{
        __typename?: "UltraplanTicket";
        id: string;
        ultraplanId: string;
        ticketId: string;
        status: UltraplanTicketStatus;
        position: number;
        ticket: {
          __typename?: "Ticket";
          id: string;
          title: string;
          status: TicketStatus;
          dependencies: Array<{
            __typename?: "TicketDependency";
            dependsOnTicket: { __typename?: "Ticket"; id: string; title: string };
          }>;
        };
      }>;
      ticketExecutions: Array<{
        __typename?: "TicketExecution";
        id: string;
        ultraplanId: string;
        ticketId: string;
        updatedAt: string;
        status: TicketExecutionStatus;
        integrationStatus: IntegrationStatus;
        branch: string;
        workerSessionId?: string | null;
      }>;
      controllerRuns: Array<{
        __typename?: "UltraplanControllerRun";
        id: string;
        ultraplanId: string;
        sessionGroupId: string;
        status: ControllerRunStatus;
        summaryTitle?: string | null;
        summary?: string | null;
        sessionId?: string | null;
        createdAt: string;
        startedAt?: string | null;
        completedAt?: string | null;
      }>;
    } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      role: SessionRole;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  } | null;
};

export type StartUltraplanFromComposerMutationVariables = Exact<{
  input: StartUltraplanInput;
}>;

export type StartUltraplanFromComposerMutation = {
  __typename?: "Mutation";
  startUltraplan: {
    __typename?: "Ultraplan";
    id: string;
    status: UltraplanStatus;
    sessionGroupId: string;
    updatedAt: string;
  };
};

export type PauseUltraplanFromGroupMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type PauseUltraplanFromGroupMutation = {
  __typename?: "Mutation";
  pauseUltraplan: { __typename?: "Ultraplan"; id: string };
};

export type ResumeUltraplanFromGroupMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type ResumeUltraplanFromGroupMutation = {
  __typename?: "Mutation";
  resumeUltraplan: { __typename?: "Ultraplan"; id: string };
};

export type RunUltraplanControllerFromGroupMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type RunUltraplanControllerFromGroupMutation = {
  __typename?: "Mutation";
  runUltraplanControllerNow: { __typename?: "UltraplanControllerRun"; id: string };
};

export type CancelUltraplanFromGroupMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type CancelUltraplanFromGroupMutation = {
  __typename?: "Mutation";
  cancelUltraplan: { __typename?: "Ultraplan"; id: string };
};

export type AgentIdentityQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type AgentIdentityQuery = {
  __typename?: "Query";
  agentIdentity?: {
    __typename?: "AgentIdentity";
    id: string;
    name: string;
    status: OrgAgentStatus;
    autonomyMode: AutonomyMode;
    soulFile: string;
  } | null;
};

export type UpdateAgentSettingsMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  input: UpdateAgentSettingsInput;
}>;

export type UpdateAgentSettingsMutation = {
  __typename?: "Mutation";
  updateAgentSettings: {
    __typename?: "AgentIdentity";
    id: string;
    name: string;
    status: OrgAgentStatus;
    autonomyMode: AutonomyMode;
    soulFile: string;
  };
};

export type MyApiTokensQueryVariables = Exact<{ [key: string]: never }>;

export type MyApiTokensQuery = {
  __typename?: "Query";
  myApiTokens: Array<{
    __typename?: "ApiTokenStatus";
    provider: ApiTokenProvider;
    isSet: boolean;
    updatedAt?: string | null;
  }>;
};

export type SetApiTokenMutationVariables = Exact<{
  input: SetApiTokenInput;
}>;

export type SetApiTokenMutation = {
  __typename?: "Mutation";
  setApiToken: {
    __typename?: "ApiTokenStatus";
    provider: ApiTokenProvider;
    isSet: boolean;
    updatedAt?: string | null;
  };
};

export type DeleteApiTokenMutationVariables = Exact<{
  provider: ApiTokenProvider;
}>;

export type DeleteApiTokenMutation = { __typename?: "Mutation"; deleteApiToken: boolean };

export type CreateRepoMutationVariables = Exact<{
  input: CreateRepoInput;
}>;

export type CreateRepoMutation = {
  __typename?: "Mutation";
  createRepo: { __typename?: "Repo"; id: string };
};

export type AddOrgMemberMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
  role?: InputMaybe<UserRole>;
}>;

export type AddOrgMemberMutation = {
  __typename?: "Mutation";
  addOrgMember: {
    __typename?: "OrgMember";
    role: UserRole;
    joinedAt: string;
    user: {
      __typename?: "User";
      id: string;
      name: string;
      email: string;
      avatarUrl?: string | null;
    };
  };
};

export type RemoveOrgMemberMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
}>;

export type RemoveOrgMemberMutation = { __typename?: "Mutation"; removeOrgMember: boolean };

export type UpdateOrgMemberRoleMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
  role: UserRole;
}>;

export type UpdateOrgMemberRoleMutation = {
  __typename?: "Mutation";
  updateOrgMemberRole: {
    __typename?: "OrgMember";
    role: UserRole;
    user: { __typename?: "User"; id: string };
  };
};

export type SearchUsersQueryVariables = Exact<{
  query: Scalars["String"]["input"];
}>;

export type SearchUsersQuery = {
  __typename?: "Query";
  searchUsers: Array<{
    __typename?: "User";
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  }>;
};

export type SettingsReposQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type SettingsReposQuery = {
  __typename?: "Query";
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    remoteUrl: string;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
};

export type AgentEnvironmentsSettingsQueryVariables = Exact<{
  orgId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
}>;

export type AgentEnvironmentsSettingsQuery = {
  __typename?: "Query";
  agentEnvironments: Array<{
    __typename?: "AgentEnvironment";
    id: string;
    orgId: string;
    name: string;
    adapterType: AgentEnvironmentAdapterType;
    config: JsonValue;
    enabled: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    remoteUrl: string;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
  orgSecrets: Array<{
    __typename?: "OrgSecret";
    id: string;
    orgId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
  myConnections: Array<{
    __typename?: "ConnectionsBridge";
    bridge: {
      __typename?: "BridgeRuntime";
      id: string;
      instanceId: string;
      label: string;
      hostingMode: HostingMode;
      connected: boolean;
    };
    repos: Array<{
      __typename?: "ConnectionsRepoEntry";
      repo: { __typename?: "Repo"; id: string; name: string };
    }>;
  }>;
};

export type OrgSecretsQueryVariables = Exact<{
  orgId: Scalars["ID"]["input"];
}>;

export type OrgSecretsQuery = {
  __typename?: "Query";
  orgSecrets: Array<{
    __typename?: "OrgSecret";
    id: string;
    orgId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type CreateAgentEnvironmentMutationVariables = Exact<{
  input: CreateAgentEnvironmentInput;
}>;

export type CreateAgentEnvironmentMutation = {
  __typename?: "Mutation";
  createAgentEnvironment: {
    __typename?: "AgentEnvironment";
    id: string;
    orgId: string;
    name: string;
    adapterType: AgentEnvironmentAdapterType;
    config: JsonValue;
    enabled: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

export type UpdateAgentEnvironmentMutationVariables = Exact<{
  input: UpdateAgentEnvironmentInput;
}>;

export type UpdateAgentEnvironmentMutation = {
  __typename?: "Mutation";
  updateAgentEnvironment: {
    __typename?: "AgentEnvironment";
    id: string;
    orgId: string;
    name: string;
    adapterType: AgentEnvironmentAdapterType;
    config: JsonValue;
    enabled: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteAgentEnvironmentMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteAgentEnvironmentMutation = {
  __typename?: "Mutation";
  deleteAgentEnvironment: boolean;
};

export type TestAgentEnvironmentMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type TestAgentEnvironmentMutation = {
  __typename?: "Mutation";
  testAgentEnvironment: {
    __typename?: "AgentEnvironmentTestResult";
    ok: boolean;
    message?: string | null;
  };
};

export type SetOrgSecretMutationVariables = Exact<{
  input: SetOrgSecretInput;
}>;

export type SetOrgSecretMutation = {
  __typename?: "Mutation";
  setOrgSecret: {
    __typename?: "OrgSecret";
    id: string;
    orgId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteOrgSecretMutationVariables = Exact<{
  orgId: Scalars["ID"]["input"];
  id: Scalars["ID"]["input"];
}>;

export type DeleteOrgSecretMutation = { __typename?: "Mutation"; deleteOrgSecret: boolean };

export type CreateDmMutationVariables = Exact<{
  input: CreateChatInput;
}>;

export type CreateDmMutation = {
  __typename?: "Mutation";
  createChat: { __typename?: "Chat"; id: string };
};

export type AllChannelsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type AllChannelsQuery = {
  __typename?: "Query";
  channels: Array<{
    __typename?: "Channel";
    id: string;
    name: string;
    type: ChannelType;
    members: Array<{
      __typename?: "ChannelMember";
      joinedAt: string;
      user: { __typename?: "User"; id: string };
    }>;
  }>;
};

export type JoinChannelMutationVariables = Exact<{
  channelId: Scalars["ID"]["input"];
}>;

export type JoinChannelMutation = {
  __typename?: "Mutation";
  joinChannel: { __typename?: "Channel"; id: string };
};

export type LeaveChannelMutationVariables = Exact<{
  channelId: Scalars["ID"]["input"];
}>;

export type LeaveChannelMutation = {
  __typename?: "Mutation";
  leaveChannel: { __typename?: "Channel"; id: string };
};

export type UpdateChannelGroupCollapseMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateChannelGroupInput;
}>;

export type UpdateChannelGroupCollapseMutation = {
  __typename?: "Mutation";
  updateChannelGroup: { __typename?: "ChannelGroup"; id: string };
};

export type CreateChannelMutationVariables = Exact<{
  input: CreateChannelInput;
}>;

export type CreateChannelMutation = {
  __typename?: "Mutation";
  createChannel: { __typename?: "Channel"; id: string };
};

export type CreateChannelGroupMutationVariables = Exact<{
  input: CreateChannelGroupInput;
}>;

export type CreateChannelGroupMutation = {
  __typename?: "Mutation";
  createChannelGroup: { __typename?: "ChannelGroup"; id: string };
};

export type CreateChatMutationVariables = Exact<{
  input: CreateChatInput;
}>;

export type CreateChatMutation = {
  __typename?: "Mutation";
  createChat: { __typename?: "Chat"; id: string };
};

export type DeleteChannelGroupMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteChannelGroupMutation = { __typename?: "Mutation"; deleteChannelGroup: boolean };

export type TicketsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type TicketsQuery = {
  __typename?: "Query";
  tickets: Array<{
    __typename?: "Ticket";
    id: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: Priority;
    labels: Array<string>;
    createdAt: string;
    updatedAt: string;
    assignees: Array<{ __typename?: "User"; id: string; name: string; avatarUrl?: string | null }>;
    createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    channel?: { __typename?: "Channel"; id: string } | null;
  }>;
};

export type MoveChannelMutationVariables = Exact<{
  input: MoveChannelInput;
}>;

export type MoveChannelMutation = {
  __typename?: "Mutation";
  moveChannel: { __typename?: "Channel"; id: string };
};

export type UpdateChannelGroupPositionMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateChannelGroupInput;
}>;

export type UpdateChannelGroupPositionMutation = {
  __typename?: "Mutation";
  updateChannelGroup: { __typename?: "ChannelGroup"; id: string };
};

export type ReorderChannelsMutationVariables = Exact<{
  input: ReorderChannelsInput;
}>;

export type ReorderChannelsMutation = {
  __typename?: "Mutation";
  reorderChannels: Array<{ __typename?: "Channel"; id: string }>;
};

export type ChannelMessagesQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
}>;

export type ChannelMessagesQuery = {
  __typename?: "Query";
  channelMessages: Array<{
    __typename?: "Message";
    id: string;
    chatId?: string | null;
    channelId?: string | null;
    text: string;
    html?: string | null;
    mentions?: JsonValue | null;
    parentMessageId?: string | null;
    replyCount: number;
    latestReplyAt?: string | null;
    createdAt: string;
    updatedAt: string;
    editedAt?: string | null;
    deletedAt?: string | null;
    threadRepliers: Array<{
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    }>;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type ChannelEventsForMessagesSubscriptionVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type ChannelEventsForMessagesSubscription = {
  __typename?: "Subscription";
  channelEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type ChatMessagesQueryVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
}>;

export type ChatMessagesQuery = {
  __typename?: "Query";
  chatMessages: Array<{
    __typename?: "Message";
    id: string;
    chatId?: string | null;
    text: string;
    html?: string | null;
    mentions?: JsonValue | null;
    parentMessageId?: string | null;
    replyCount: number;
    latestReplyAt?: string | null;
    createdAt: string;
    updatedAt: string;
    editedAt?: string | null;
    deletedAt?: string | null;
    threadRepliers: Array<{
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    }>;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type ChatEventsSubscriptionSubscriptionVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type ChatEventsSubscriptionSubscription = {
  __typename?: "Subscription";
  chatEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type OrgEventsSubscriptionVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type OrgEventsSubscription = {
  __typename?: "Subscription";
  orgEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type SessionEventsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  scope?: InputMaybe<ScopeInput>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type SessionEventsQuery = {
  __typename?: "Query";
  events: Array<{
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type SessionEventsLiveSubscriptionVariables = Exact<{
  sessionId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
}>;

export type SessionEventsLiveSubscription = {
  __typename?: "Subscription";
  sessionEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type ChannelsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  memberOnly?: InputMaybe<Scalars["Boolean"]["input"]>;
}>;

export type ChannelsQuery = {
  __typename?: "Query";
  channels: Array<{
    __typename?: "Channel";
    id: string;
    name: string;
    type: ChannelType;
    position: number;
    groupId?: string | null;
    baseBranch?: string | null;
    setupScript?: string | null;
    runScripts?: JsonValue | null;
    repo?: { __typename?: "Repo"; id: string; name: string } | null;
  }>;
};

export type ChannelGroupsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type ChannelGroupsQuery = {
  __typename?: "Query";
  channelGroups: Array<{
    __typename?: "ChannelGroup";
    id: string;
    name: string;
    position: number;
    isCollapsed: boolean;
  }>;
};

export type ReposQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type ReposQuery = {
  __typename?: "Query";
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    remoteUrl: string;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
};

export type ChatsQueryVariables = Exact<{ [key: string]: never }>;

export type ChatsQuery = {
  __typename?: "Query";
  chats: Array<{
    __typename?: "Chat";
    id: string;
    type: ChatType;
    name?: string | null;
    createdAt: string;
    updatedAt: string;
    members: Array<{
      __typename?: "ChatMember";
      joinedAt: string;
      user: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    }>;
  }>;
};

export type InboxItemsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type InboxItemsQuery = {
  __typename?: "Query";
  inboxItems: Array<{
    __typename?: "InboxItem";
    id: string;
    itemType: InboxItemType;
    status: InboxItemStatus;
    title: string;
    summary?: string | null;
    payload: JsonValue;
    userId: string;
    sourceType: string;
    sourceId: string;
    createdAt: string;
    resolvedAt?: string | null;
  }>;
};

export type OnboardingReposQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type OnboardingReposQuery = {
  __typename?: "Query";
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    remoteUrl: string;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
};

export type OnboardingSessionsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type OnboardingSessionsQuery = {
  __typename?: "Query";
  sessions: Array<{ __typename?: "Session"; id: string }>;
};

export const AgentIdentityDebugDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentIdentityDebug" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentIdentity" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "autonomyMode" } },
                { kind: "Field", name: { kind: "Name", value: "soulFile" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "costBudget" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "dailyLimitCents" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AgentIdentityDebugQuery, AgentIdentityDebugQueryVariables>;
export const UpdateAgentSettingsDebugDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateAgentSettingsDebug" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateAgentSettingsInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateAgentSettings" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "autonomyMode" } },
                { kind: "Field", name: { kind: "Name", value: "soulFile" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "costBudget" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "dailyLimitCents" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateAgentSettingsDebugMutation,
  UpdateAgentSettingsDebugMutationVariables
>;
export const AgentCostSummaryDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentCostSummary" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "startDate" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "endDate" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentCostSummary" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "startDate" },
                value: { kind: "Variable", name: { kind: "Name", value: "startDate" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "endDate" },
                value: { kind: "Variable", name: { kind: "Name", value: "endDate" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "budget" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "dailyLimitCents" } },
                      { kind: "Field", name: { kind: "Name", value: "spentCents" } },
                      { kind: "Field", name: { kind: "Name", value: "remainingCents" } },
                      { kind: "Field", name: { kind: "Name", value: "remainingPercent" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "dailyCosts" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "date" } },
                      { kind: "Field", name: { kind: "Name", value: "totalCostCents" } },
                      { kind: "Field", name: { kind: "Name", value: "tier2Calls" } },
                      { kind: "Field", name: { kind: "Name", value: "tier2CostCents" } },
                      { kind: "Field", name: { kind: "Name", value: "tier3Calls" } },
                      { kind: "Field", name: { kind: "Name", value: "tier3CostCents" } },
                      { kind: "Field", name: { kind: "Name", value: "summaryCalls" } },
                      { kind: "Field", name: { kind: "Name", value: "summaryCostCents" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AgentCostSummaryQuery, AgentCostSummaryQueryVariables>;
export const AgentExecutionLogDetailDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentExecutionLogDetail" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentExecutionLog" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "organizationId" } },
                { kind: "Field", name: { kind: "Name", value: "triggerEventId" } },
                { kind: "Field", name: { kind: "Name", value: "batchSize" } },
                { kind: "Field", name: { kind: "Name", value: "agentId" } },
                { kind: "Field", name: { kind: "Name", value: "modelTier" } },
                { kind: "Field", name: { kind: "Name", value: "model" } },
                { kind: "Field", name: { kind: "Name", value: "promoted" } },
                { kind: "Field", name: { kind: "Name", value: "promotionReason" } },
                { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                { kind: "Field", name: { kind: "Name", value: "estimatedCostCents" } },
                { kind: "Field", name: { kind: "Name", value: "contextTokenAllocation" } },
                { kind: "Field", name: { kind: "Name", value: "disposition" } },
                { kind: "Field", name: { kind: "Name", value: "confidence" } },
                { kind: "Field", name: { kind: "Name", value: "plannedActions" } },
                { kind: "Field", name: { kind: "Name", value: "policyDecision" } },
                { kind: "Field", name: { kind: "Name", value: "finalActions" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "inboxItemId" } },
                { kind: "Field", name: { kind: "Name", value: "latencyMs" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "llmCalls" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "executionLogId" } },
                      { kind: "Field", name: { kind: "Name", value: "turnNumber" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "provider" } },
                      { kind: "Field", name: { kind: "Name", value: "systemPrompt" } },
                      { kind: "Field", name: { kind: "Name", value: "messages" } },
                      { kind: "Field", name: { kind: "Name", value: "tools" } },
                      { kind: "Field", name: { kind: "Name", value: "maxTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "temperature" } },
                      { kind: "Field", name: { kind: "Name", value: "responseContent" } },
                      { kind: "Field", name: { kind: "Name", value: "stopReason" } },
                      { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "estimatedCostCents" } },
                      { kind: "Field", name: { kind: "Name", value: "latencyMs" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AgentExecutionLogDetailQuery, AgentExecutionLogDetailQueryVariables>;
export const AgentExecutionLogsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentExecutionLogs" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filters" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ExecutionLogFilters" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentExecutionLogs" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filters" },
                value: { kind: "Variable", name: { kind: "Name", value: "filters" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "items" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "triggerEventId" } },
                      { kind: "Field", name: { kind: "Name", value: "batchSize" } },
                      { kind: "Field", name: { kind: "Name", value: "agentId" } },
                      { kind: "Field", name: { kind: "Name", value: "modelTier" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "promoted" } },
                      { kind: "Field", name: { kind: "Name", value: "promotionReason" } },
                      { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "estimatedCostCents" } },
                      { kind: "Field", name: { kind: "Name", value: "disposition" } },
                      { kind: "Field", name: { kind: "Name", value: "confidence" } },
                      { kind: "Field", name: { kind: "Name", value: "status" } },
                      { kind: "Field", name: { kind: "Name", value: "latencyMs" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "totalCount" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AgentExecutionLogsQuery, AgentExecutionLogsQueryVariables>;
export const AgentWorkerStatusDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentWorkerStatus" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentWorkerStatus" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "running" } },
                { kind: "Field", name: { kind: "Name", value: "uptime" } },
                { kind: "Field", name: { kind: "Name", value: "openAggregationWindows" } },
                { kind: "Field", name: { kind: "Name", value: "activeOrganizations" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "agentAggregationWindows" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "scopeKey" } },
                { kind: "Field", name: { kind: "Name", value: "eventCount" } },
                { kind: "Field", name: { kind: "Name", value: "openedAt" } },
                { kind: "Field", name: { kind: "Name", value: "lastEventAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AgentWorkerStatusQuery, AgentWorkerStatusQueryVariables>;
export const SendChannelMessageDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SendChannelMessage" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "html" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sendChannelMessage" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "html" },
                value: { kind: "Variable", name: { kind: "Name", value: "html" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentId" },
                value: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SendChannelMessageMutation, SendChannelMessageMutationVariables>;
export const SessionGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "archived" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "archived" },
                value: { kind: "Variable", name: { kind: "Name", value: "archived" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "slug" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "role" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupsQuery, SessionGroupsQueryVariables>;
export const FilteredSessionGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "FilteredSessionGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "archived" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "status" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "SessionGroupStatus" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "archived" },
                value: { kind: "Variable", name: { kind: "Name", value: "archived" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "status" },
                value: { kind: "Variable", name: { kind: "Name", value: "status" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "role" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<FilteredSessionGroupsQuery, FilteredSessionGroupsQueryVariables>;
export const AddChatMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddChatMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "AddChatMemberInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addChatMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddChatMemberMutation, AddChatMemberMutationVariables>;
export const SendChatMessageDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SendChatMessage" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "html" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "clientMutationId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sendChatMessage" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "html" },
                value: { kind: "Variable", name: { kind: "Name", value: "html" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentId" },
                value: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "clientMutationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "clientMutationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SendChatMessageMutation, SendChatMessageMutationVariables>;
export const RenameChatDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RenameChat" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "name" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "renameChat" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "name" },
                value: { kind: "Variable", name: { kind: "Name", value: "name" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RenameChatMutation, RenameChatMutationVariables>;
export const ThreadRepliesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ThreadReplies" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "rootMessageId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "threadReplies" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "rootMessageId" },
                value: { kind: "Variable", name: { kind: "Name", value: "rootMessageId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "channelId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "html" } },
                { kind: "Field", name: { kind: "Name", value: "mentions" } },
                { kind: "Field", name: { kind: "Name", value: "parentMessageId" } },
                { kind: "Field", name: { kind: "Name", value: "replyCount" } },
                { kind: "Field", name: { kind: "Name", value: "latestReplyAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "threadRepliers" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "editedAt" } },
                { kind: "Field", name: { kind: "Name", value: "deletedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ThreadRepliesQuery, ThreadRepliesQueryVariables>;
export const SessionGroupBranchDiffDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupBranchDiff" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupBranchDiff" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "path" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "additions" } },
                { kind: "Field", name: { kind: "Name", value: "deletions" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupBranchDiffQuery, SessionGroupBranchDiffQueryVariables>;
export const SessionGroupFilesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFiles" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFiles" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFilesQuery, SessionGroupFilesQueryVariables>;
export const SessionGroupFileAtRefDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileAtRef" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "ref" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileAtRef" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "ref" },
                value: { kind: "Variable", name: { kind: "Name", value: "ref" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFileAtRefQuery, SessionGroupFileAtRefQueryVariables>;
export const SessionGroupFileContentForDiffDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileContentForDiff" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileContent" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionGroupFileContentForDiffQuery,
  SessionGroupFileContentForDiffQueryVariables
>;
export const SessionGroupFileContentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileContent" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileContent" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFileContentQuery, SessionGroupFileContentQueryVariables>;
export const SessionDetailDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionDetail" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "session" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                { kind: "Field", name: { kind: "Name", value: "role" } },
                { kind: "Field", name: { kind: "Name", value: "tool" } },
                { kind: "Field", name: { kind: "Name", value: "model" } },
                { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                { kind: "Field", name: { kind: "Name", value: "hosting" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "branch" } },
                { kind: "Field", name: { kind: "Name", value: "workdir" } },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "connection" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "state" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                      { kind: "Field", name: { kind: "Name", value: "lastError" } },
                      { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                      { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                      { kind: "Field", name: { kind: "Name", value: "canMove" } },
                      { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdBy" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessionGroup" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "workdir" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "gitCheckpoints" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                            { kind: "Field", name: { kind: "Name", value: "promptEventId" } },
                            { kind: "Field", name: { kind: "Name", value: "commitSha" } },
                            { kind: "Field", name: { kind: "Name", value: "subject" } },
                            { kind: "Field", name: { kind: "Name", value: "author" } },
                            { kind: "Field", name: { kind: "Name", value: "committedAt" } },
                            { kind: "Field", name: { kind: "Name", value: "filesChanged" } },
                            { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "setupError" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "gitCheckpoints" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                      { kind: "Field", name: { kind: "Name", value: "promptEventId" } },
                      { kind: "Field", name: { kind: "Name", value: "commitSha" } },
                      { kind: "Field", name: { kind: "Name", value: "subject" } },
                      { kind: "Field", name: { kind: "Name", value: "author" } },
                      { kind: "Field", name: { kind: "Name", value: "committedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "filesChanged" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "queuedMessages" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                      { kind: "Field", name: { kind: "Name", value: "text" } },
                      { kind: "Field", name: { kind: "Name", value: "imageKeys" } },
                      { kind: "Field", name: { kind: "Name", value: "interactionMode" } },
                      { kind: "Field", name: { kind: "Name", value: "position" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionDetailQuery, SessionDetailQueryVariables>;
export const SessionGroupDetailDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupDetail" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "slug" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "branch" } },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "workdir" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "gitCheckpoints" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                      { kind: "Field", name: { kind: "Name", value: "promptEventId" } },
                      { kind: "Field", name: { kind: "Name", value: "commitSha" } },
                      { kind: "Field", name: { kind: "Name", value: "subject" } },
                      { kind: "Field", name: { kind: "Name", value: "author" } },
                      { kind: "Field", name: { kind: "Name", value: "committedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "filesChanged" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "connection" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "state" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                      { kind: "Field", name: { kind: "Name", value: "lastError" } },
                      { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                      { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                      { kind: "Field", name: { kind: "Name", value: "canMove" } },
                      { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "ultraplan" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "status" } },
                      { kind: "Field", name: { kind: "Name", value: "planSummary" } },
                      { kind: "Field", name: { kind: "Name", value: "lastControllerSummary" } },
                      { kind: "Field", name: { kind: "Name", value: "activeInboxItemId" } },
                      { kind: "Field", name: { kind: "Name", value: "integrationBranch" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "tickets" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "ultraplanId" } },
                            { kind: "Field", name: { kind: "Name", value: "ticketId" } },
                            { kind: "Field", name: { kind: "Name", value: "status" } },
                            { kind: "Field", name: { kind: "Name", value: "position" } },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "ticket" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  { kind: "Field", name: { kind: "Name", value: "id" } },
                                  { kind: "Field", name: { kind: "Name", value: "title" } },
                                  { kind: "Field", name: { kind: "Name", value: "status" } },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "dependencies" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "dependsOnTicket" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "id" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "title" },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "ticketExecutions" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "ultraplanId" } },
                            { kind: "Field", name: { kind: "Name", value: "ticketId" } },
                            { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                            { kind: "Field", name: { kind: "Name", value: "status" } },
                            { kind: "Field", name: { kind: "Name", value: "integrationStatus" } },
                            { kind: "Field", name: { kind: "Name", value: "branch" } },
                            { kind: "Field", name: { kind: "Name", value: "workerSessionId" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "controllerRuns" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "ultraplanId" } },
                            { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                            { kind: "Field", name: { kind: "Name", value: "status" } },
                            { kind: "Field", name: { kind: "Name", value: "summaryTitle" } },
                            { kind: "Field", name: { kind: "Name", value: "summary" } },
                            { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                            { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                            { kind: "Field", name: { kind: "Name", value: "startedAt" } },
                            { kind: "Field", name: { kind: "Name", value: "completedAt" } },
                          ],
                        },
                      },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "role" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupDetailQuery, SessionGroupDetailQueryVariables>;
export const StartUltraplanFromComposerDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "StartUltraplanFromComposer" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "StartUltraplanInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "startUltraplan" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  StartUltraplanFromComposerMutation,
  StartUltraplanFromComposerMutationVariables
>;
export const PauseUltraplanFromGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "PauseUltraplanFromGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "pauseUltraplan" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  PauseUltraplanFromGroupMutation,
  PauseUltraplanFromGroupMutationVariables
>;
export const ResumeUltraplanFromGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ResumeUltraplanFromGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "resumeUltraplan" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ResumeUltraplanFromGroupMutation,
  ResumeUltraplanFromGroupMutationVariables
>;
export const RunUltraplanControllerFromGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RunUltraplanControllerFromGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "runUltraplanControllerNow" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RunUltraplanControllerFromGroupMutation,
  RunUltraplanControllerFromGroupMutationVariables
>;
export const CancelUltraplanFromGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CancelUltraplanFromGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "cancelUltraplan" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CancelUltraplanFromGroupMutation,
  CancelUltraplanFromGroupMutationVariables
>;
export const AgentIdentityDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentIdentity" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentIdentity" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "autonomyMode" } },
                { kind: "Field", name: { kind: "Name", value: "soulFile" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AgentIdentityQuery, AgentIdentityQueryVariables>;
export const UpdateAgentSettingsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateAgentSettings" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateAgentSettingsInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateAgentSettings" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "autonomyMode" } },
                { kind: "Field", name: { kind: "Name", value: "soulFile" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateAgentSettingsMutation, UpdateAgentSettingsMutationVariables>;
export const MyApiTokensDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "MyApiTokens" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "myApiTokens" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "isSet" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MyApiTokensQuery, MyApiTokensQueryVariables>;
export const SetApiTokenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SetApiToken" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "SetApiTokenInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "setApiToken" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "isSet" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetApiTokenMutation, SetApiTokenMutationVariables>;
export const DeleteApiTokenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteApiToken" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "provider" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ApiTokenProvider" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteApiToken" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "provider" },
                value: { kind: "Variable", name: { kind: "Name", value: "provider" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteApiTokenMutation, DeleteApiTokenMutationVariables>;
export const CreateRepoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateRepo" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateRepoInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createRepo" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateRepoMutation, CreateRepoMutationVariables>;
export const AddOrgMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddOrgMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "userId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "role" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "UserRole" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addOrgMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "userId" },
                value: { kind: "Variable", name: { kind: "Name", value: "userId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "role" },
                value: { kind: "Variable", name: { kind: "Name", value: "role" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "user" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "email" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "role" } },
                { kind: "Field", name: { kind: "Name", value: "joinedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddOrgMemberMutation, AddOrgMemberMutationVariables>;
export const RemoveOrgMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RemoveOrgMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "userId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "removeOrgMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "userId" },
                value: { kind: "Variable", name: { kind: "Name", value: "userId" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RemoveOrgMemberMutation, RemoveOrgMemberMutationVariables>;
export const UpdateOrgMemberRoleDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateOrgMemberRole" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "userId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "role" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UserRole" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateOrgMemberRole" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "userId" },
                value: { kind: "Variable", name: { kind: "Name", value: "userId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "role" },
                value: { kind: "Variable", name: { kind: "Name", value: "role" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "user" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "role" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateOrgMemberRoleMutation, UpdateOrgMemberRoleMutationVariables>;
export const SearchUsersDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SearchUsers" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "query" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "searchUsers" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "query" },
                value: { kind: "Variable", name: { kind: "Name", value: "query" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "email" } },
                { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SearchUsersQuery, SearchUsersQueryVariables>;
export const SettingsReposDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SettingsRepos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SettingsReposQuery, SettingsReposQueryVariables>;
export const AgentEnvironmentsSettingsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentEnvironmentsSettings" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentEnvironments" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "adapterType" } },
                { kind: "Field", name: { kind: "Name", value: "config" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "isDefault" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "orgSecrets" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "myConnections" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "bridge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "instanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "label" } },
                      { kind: "Field", name: { kind: "Name", value: "hostingMode" } },
                      { kind: "Field", name: { kind: "Name", value: "connected" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repos" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AgentEnvironmentsSettingsQuery,
  AgentEnvironmentsSettingsQueryVariables
>;
export const OrgSecretsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "OrgSecrets" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "orgSecrets" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OrgSecretsQuery, OrgSecretsQueryVariables>;
export const CreateAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "CreateAgentEnvironmentInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "adapterType" } },
                { kind: "Field", name: { kind: "Name", value: "config" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "isDefault" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateAgentEnvironmentMutation,
  CreateAgentEnvironmentMutationVariables
>;
export const UpdateAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "UpdateAgentEnvironmentInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "adapterType" } },
                { kind: "Field", name: { kind: "Name", value: "config" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "isDefault" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateAgentEnvironmentMutation,
  UpdateAgentEnvironmentMutationVariables
>;
export const DeleteAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteAgentEnvironmentMutation,
  DeleteAgentEnvironmentMutationVariables
>;
export const TestAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "TestAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "testAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "ok" } },
                { kind: "Field", name: { kind: "Name", value: "message" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TestAgentEnvironmentMutation, TestAgentEnvironmentMutationVariables>;
export const SetOrgSecretDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SetOrgSecret" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "SetOrgSecretInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "setOrgSecret" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetOrgSecretMutation, SetOrgSecretMutationVariables>;
export const DeleteOrgSecretDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteOrgSecret" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteOrgSecret" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteOrgSecretMutation, DeleteOrgSecretMutationVariables>;
export const CreateDmDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateDM" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChatInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChat" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateDmMutation, CreateDmMutationVariables>;
export const AllChannelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AllChannels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "type" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "members" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "user" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "joinedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AllChannelsQuery, AllChannelsQueryVariables>;
export const JoinChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "JoinChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "joinChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<JoinChannelMutation, JoinChannelMutationVariables>;
export const LeaveChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "LeaveChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "leaveChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LeaveChannelMutation, LeaveChannelMutationVariables>;
export const UpdateChannelGroupCollapseDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateChannelGroupCollapse" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateChannelGroupInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateChannelGroupCollapseMutation,
  UpdateChannelGroupCollapseMutationVariables
>;
export const CreateChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChannelInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChannelMutation, CreateChannelMutationVariables>;
export const CreateChannelGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateChannelGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChannelGroupInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChannelGroupMutation, CreateChannelGroupMutationVariables>;
export const CreateChatDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateChat" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChatInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChat" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChatMutation, CreateChatMutationVariables>;
export const DeleteChannelGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteChannelGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteChannelGroupMutation, DeleteChannelGroupMutationVariables>;
export const TicketsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Tickets" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "tickets" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "priority" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "assignees" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "labels" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdBy" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TicketsQuery, TicketsQueryVariables>;
export const MoveChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "MoveChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "MoveChannelInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "moveChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MoveChannelMutation, MoveChannelMutationVariables>;
export const UpdateChannelGroupPositionDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateChannelGroupPosition" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateChannelGroupInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateChannelGroupPositionMutation,
  UpdateChannelGroupPositionMutationVariables
>;
export const ReorderChannelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ReorderChannels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ReorderChannelsInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "reorderChannels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReorderChannelsMutation, ReorderChannelsMutationVariables>;
export const ChannelMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChannelMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channelMessages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "channelId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "html" } },
                { kind: "Field", name: { kind: "Name", value: "mentions" } },
                { kind: "Field", name: { kind: "Name", value: "parentMessageId" } },
                { kind: "Field", name: { kind: "Name", value: "replyCount" } },
                { kind: "Field", name: { kind: "Name", value: "latestReplyAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "threadRepliers" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "editedAt" } },
                { kind: "Field", name: { kind: "Name", value: "deletedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelMessagesQuery, ChannelMessagesQueryVariables>;
export const ChannelEventsForMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "ChannelEventsForMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "types" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channelEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "types" },
                value: { kind: "Variable", name: { kind: "Name", value: "types" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ChannelEventsForMessagesSubscription,
  ChannelEventsForMessagesSubscriptionVariables
>;
export const ChatMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChatMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "chatMessages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "html" } },
                { kind: "Field", name: { kind: "Name", value: "mentions" } },
                { kind: "Field", name: { kind: "Name", value: "parentMessageId" } },
                { kind: "Field", name: { kind: "Name", value: "replyCount" } },
                { kind: "Field", name: { kind: "Name", value: "latestReplyAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "threadRepliers" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "editedAt" } },
                { kind: "Field", name: { kind: "Name", value: "deletedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChatMessagesQuery, ChatMessagesQueryVariables>;
export const ChatEventsSubscriptionDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "ChatEventsSubscription" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "types" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "chatEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "types" },
                value: { kind: "Variable", name: { kind: "Name", value: "types" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ChatEventsSubscriptionSubscription,
  ChatEventsSubscriptionSubscriptionVariables
>;
export const OrgEventsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OrgEvents" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "orgEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OrgEventsSubscription, OrgEventsSubscriptionVariables>;
export const SessionEventsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionEvents" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "scope" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ScopeInput" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "events" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "scope" },
                value: { kind: "Variable", name: { kind: "Name", value: "scope" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "excludePayloadTypes" },
                value: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionEventsQuery, SessionEventsQueryVariables>;
export const SessionEventsLiveDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "SessionEventsLive" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionEventsLiveSubscription, SessionEventsLiveSubscriptionVariables>;
export const ChannelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Channels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "memberOnly" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "memberOnly" },
                value: { kind: "Variable", name: { kind: "Name", value: "memberOnly" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "type" } },
                { kind: "Field", name: { kind: "Name", value: "position" } },
                { kind: "Field", name: { kind: "Name", value: "groupId" } },
                { kind: "Field", name: { kind: "Name", value: "baseBranch" } },
                { kind: "Field", name: { kind: "Name", value: "setupScript" } },
                { kind: "Field", name: { kind: "Name", value: "runScripts" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelsQuery, ChannelsQueryVariables>;
export const ChannelGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChannelGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channelGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "position" } },
                { kind: "Field", name: { kind: "Name", value: "isCollapsed" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelGroupsQuery, ChannelGroupsQueryVariables>;
export const ReposDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Repos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReposQuery, ReposQueryVariables>;
export const ChatsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Chats" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "chats" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "type" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "members" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "user" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "joinedAt" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChatsQuery, ChatsQueryVariables>;
export const InboxItemsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "InboxItems" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "inboxItems" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "itemType" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "summary" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                { kind: "Field", name: { kind: "Name", value: "userId" } },
                { kind: "Field", name: { kind: "Name", value: "sourceType" } },
                { kind: "Field", name: { kind: "Name", value: "sourceId" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "resolvedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<InboxItemsQuery, InboxItemsQueryVariables>;
export const OnboardingReposDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "OnboardingRepos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OnboardingReposQuery, OnboardingReposQueryVariables>;
export const OnboardingSessionsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "OnboardingSessions" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessions" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OnboardingSessionsQuery, OnboardingSessionsQueryVariables>;
