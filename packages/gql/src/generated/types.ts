import { JsonValue } from "../json";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
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
  reason?: Maybe<Scalars["String"]["output"]>;
  ticket: Ticket;
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
