import { JsonValue } from '../json';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  JSON: { input: JsonValue; output: JsonValue; }
};

export type Actor = {
  __typename?: 'Actor';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  type: ActorType;
};

export type ActorType =
  | 'agent'
  | 'system'
  | 'user';

export type AddChatMemberInput = {
  chatId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};

export type AgentBudgetStatus = {
  __typename?: 'AgentBudgetStatus';
  dailyLimitCents: Scalars['Int']['output'];
  remainingCents: Scalars['Float']['output'];
  remainingPercent: Scalars['Float']['output'];
  spentCents: Scalars['Float']['output'];
};

export type AgentCostEntry = {
  __typename?: 'AgentCostEntry';
  date: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  organizationId: Scalars['ID']['output'];
  summaryCalls: Scalars['Int']['output'];
  summaryCostCents: Scalars['Float']['output'];
  tier2Calls: Scalars['Int']['output'];
  tier2CostCents: Scalars['Float']['output'];
  tier3Calls: Scalars['Int']['output'];
  tier3CostCents: Scalars['Float']['output'];
  totalCostCents: Scalars['Float']['output'];
};

export type AgentCostSummary = {
  __typename?: 'AgentCostSummary';
  budget: AgentBudgetStatus;
  dailyCosts: Array<AgentCostEntry>;
};

export type AgentExecutionLog = {
  __typename?: 'AgentExecutionLog';
  agentId: Scalars['String']['output'];
  batchSize: Scalars['Int']['output'];
  confidence: Scalars['Float']['output'];
  contextTokenAllocation?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  disposition: ExecutionDisposition;
  estimatedCostCents: Scalars['Float']['output'];
  finalActions?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  inboxItemId?: Maybe<Scalars['String']['output']>;
  inputTokens: Scalars['Int']['output'];
  latencyMs: Scalars['Int']['output'];
  llmCalls: Array<AgentLlmCall>;
  model: Scalars['String']['output'];
  modelTier: ModelTier;
  organizationId: Scalars['ID']['output'];
  outputTokens: Scalars['Int']['output'];
  plannedActions?: Maybe<Scalars['JSON']['output']>;
  policyDecision?: Maybe<Scalars['JSON']['output']>;
  promoted: Scalars['Boolean']['output'];
  promotionReason?: Maybe<Scalars['String']['output']>;
  status: ExecutionStatus;
  triggerEventId: Scalars['String']['output'];
};

export type AgentExecutionLogConnection = {
  __typename?: 'AgentExecutionLogConnection';
  items: Array<AgentExecutionLog>;
  totalCount: Scalars['Int']['output'];
};

export type AgentIdentity = {
  __typename?: 'AgentIdentity';
  autonomyMode: AutonomyMode;
  costBudget: CostBudget;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  organizationId: Scalars['ID']['output'];
  soulFile: Scalars['String']['output'];
  status: OrgAgentStatus;
  updatedAt: Scalars['DateTime']['output'];
};

export type AgentLlmCall = {
  __typename?: 'AgentLlmCall';
  createdAt: Scalars['DateTime']['output'];
  estimatedCostCents: Scalars['Float']['output'];
  executionLogId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  inputTokens: Scalars['Int']['output'];
  latencyMs: Scalars['Int']['output'];
  maxTokens?: Maybe<Scalars['Int']['output']>;
  messages: Scalars['JSON']['output'];
  model: Scalars['String']['output'];
  outputTokens: Scalars['Int']['output'];
  provider: Scalars['String']['output'];
  responseContent: Scalars['JSON']['output'];
  stopReason: Scalars['String']['output'];
  systemPrompt?: Maybe<Scalars['String']['output']>;
  temperature?: Maybe<Scalars['Float']['output']>;
  tools: Scalars['JSON']['output'];
  turnNumber: Scalars['Int']['output'];
};

export type AgentStatus =
  | 'active'
  | 'done'
  | 'failed'
  | 'not_started'
  | 'stopped';

export type AgentTrustLevel =
  | 'autonomous'
  | 'blocked'
  | 'suggest';

export type AgentWorkerStatus = {
  __typename?: 'AgentWorkerStatus';
  activeOrganizations: Scalars['Int']['output'];
  openAggregationWindows: Scalars['Int']['output'];
  running: Scalars['Boolean']['output'];
  uptime?: Maybe<Scalars['Int']['output']>;
};

export type AggregationWindowInfo = {
  __typename?: 'AggregationWindowInfo';
  eventCount: Scalars['Int']['output'];
  lastEventAt: Scalars['DateTime']['output'];
  openedAt: Scalars['DateTime']['output'];
  organizationId: Scalars['ID']['output'];
  scopeKey: Scalars['String']['output'];
};

export type AiConversation = {
  __typename?: 'AiConversation';
  branchCount: Scalars['Int']['output'];
  branches: Array<Branch>;
  createdAt: Scalars['DateTime']['output'];
  createdBy: User;
  id: Scalars['ID']['output'];
  rootBranch: Branch;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  visibility: AiConversationVisibility;
};

export type AiConversationEvent = {
  __typename?: 'AiConversationEvent';
  conversationId: Scalars['ID']['output'];
  payload: Scalars['JSON']['output'];
  timestamp: Scalars['DateTime']['output'];
  type: Scalars['String']['output'];
};

export type AiConversationVisibility =
  | 'ORG'
  | 'PRIVATE';

export type ApiTokenProvider =
  | 'anthropic'
  | 'github'
  | 'openai'
  | 'ssh_key';

export type ApiTokenStatus = {
  __typename?: 'ApiTokenStatus';
  isSet: Scalars['Boolean']['output'];
  provider: ApiTokenProvider;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type AutonomyMode =
  | 'act'
  | 'observe'
  | 'suggest';

export type Branch = {
  __typename?: 'Branch';
  childBranches: Array<Branch>;
  conversation: AiConversation;
  createdAt: Scalars['DateTime']['output'];
  createdBy: User;
  depth: Scalars['Int']['output'];
  forkTurn?: Maybe<Turn>;
  id: Scalars['ID']['output'];
  label?: Maybe<Scalars['String']['output']>;
  parentBranch?: Maybe<Branch>;
  turnCount: Scalars['Int']['output'];
  turns: Array<Turn>;
};

export type BranchDiffFile = {
  __typename?: 'BranchDiffFile';
  additions: Scalars['Int']['output'];
  deletions: Scalars['Int']['output'];
  path: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type BridgeAccessCapability =
  | 'session'
  | 'terminal';

export type BridgeAccessGrant = {
  __typename?: 'BridgeAccessGrant';
  capabilities: Array<BridgeAccessCapability>;
  createdAt: Scalars['DateTime']['output'];
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  grantedByUser: User;
  granteeUser: User;
  id: Scalars['ID']['output'];
  revokedAt?: Maybe<Scalars['DateTime']['output']>;
  scopeType: BridgeAccessScopeType;
  sessionGroup?: Maybe<SessionGroup>;
};

export type BridgeAccessRequest = {
  __typename?: 'BridgeAccessRequest';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  ownerUser: User;
  requestedCapabilities: Array<BridgeAccessCapability>;
  requestedExpiresAt?: Maybe<Scalars['DateTime']['output']>;
  requesterUser: User;
  resolvedAt?: Maybe<Scalars['DateTime']['output']>;
  resolvedByUser?: Maybe<User>;
  scopeType: BridgeAccessScopeType;
  sessionGroup?: Maybe<SessionGroup>;
  status: BridgeAccessRequestStatus;
};

export type BridgeAccessRequestStatus =
  | 'approved'
  | 'denied'
  | 'pending';

export type BridgeAccessScopeType =
  | 'all_sessions'
  | 'session_group';

export type BridgeRuntime = {
  __typename?: 'BridgeRuntime';
  accessGrants: Array<BridgeAccessGrant>;
  accessRequests: Array<BridgeAccessRequest>;
  connected: Scalars['Boolean']['output'];
  connectedAt?: Maybe<Scalars['DateTime']['output']>;
  disconnectedAt?: Maybe<Scalars['DateTime']['output']>;
  hostingMode: HostingMode;
  id: Scalars['ID']['output'];
  instanceId: Scalars['ID']['output'];
  label: Scalars['String']['output'];
  lastSeenAt: Scalars['DateTime']['output'];
  /**
   * Currently-attached linked checkouts on this bridge, one per repo at most.
   * Empty when nothing is synced or the bridge is offline. Sourced from the
   * in-memory router cache, which is warmed on bridge connect.
   */
  linkedCheckouts: Array<LinkedCheckoutStatus>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  ownerUser: User;
};

export type BridgeRuntimeAccess = {
  __typename?: 'BridgeRuntimeAccess';
  allowed: Scalars['Boolean']['output'];
  bridgeRuntimeId?: Maybe<Scalars['ID']['output']>;
  capabilities: Array<BridgeAccessCapability>;
  connected: Scalars['Boolean']['output'];
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  hostingMode?: Maybe<HostingMode>;
  isOwner: Scalars['Boolean']['output'];
  label?: Maybe<Scalars['String']['output']>;
  ownerUser?: Maybe<User>;
  pendingRequest?: Maybe<BridgeAccessRequest>;
  runtimeInstanceId: Scalars['ID']['output'];
  scopeType?: Maybe<BridgeAccessScopeType>;
  sessionGroupId?: Maybe<Scalars['ID']['output']>;
};

export type Channel = {
  __typename?: 'Channel';
  aiMode?: Maybe<AutonomyMode>;
  baseBranch?: Maybe<Scalars['String']['output']>;
  groupId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  members: Array<ChannelMember>;
  messages: Array<Event>;
  name: Scalars['String']['output'];
  position: Scalars['Int']['output'];
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  runScripts?: Maybe<Scalars['JSON']['output']>;
  setupScript?: Maybe<Scalars['String']['output']>;
  type: ChannelType;
};


export type ChannelMessagesArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type ChannelBridgeOption = {
  __typename?: 'ChannelBridgeOption';
  isOwn: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  ownerUserId?: Maybe<Scalars['ID']['output']>;
  runtimeInstanceId: Scalars['ID']['output'];
};

export type ChannelGroup = {
  __typename?: 'ChannelGroup';
  channels: Array<Channel>;
  id: Scalars['ID']['output'];
  isCollapsed: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  position: Scalars['Int']['output'];
};

export type ChannelMember = {
  __typename?: 'ChannelMember';
  joinedAt: Scalars['DateTime']['output'];
  user: User;
};

export type ChannelType =
  | 'coding'
  | 'text';

export type Chat = {
  __typename?: 'Chat';
  aiMode?: Maybe<AutonomyMode>;
  createdAt: Scalars['DateTime']['output'];
  createdBy: User;
  id: Scalars['ID']['output'];
  members: Array<ChatMember>;
  messages: Array<Message>;
  name?: Maybe<Scalars['String']['output']>;
  type: ChatType;
  updatedAt: Scalars['DateTime']['output'];
};


export type ChatMessagesArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type ChatMember = {
  __typename?: 'ChatMember';
  joinedAt: Scalars['DateTime']['output'];
  user: User;
};

export type ChatType =
  | 'dm'
  | 'group';

export type CodingTool =
  | 'claude_code'
  | 'codex'
  | 'custom';

export type CostBudget = {
  __typename?: 'CostBudget';
  dailyLimitCents: Scalars['Int']['output'];
};

export type CreateAiConversationInput = {
  title?: InputMaybe<Scalars['String']['input']>;
  visibility?: InputMaybe<AiConversationVisibility>;
};

export type CreateChannelGroupInput = {
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  position?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateChannelInput = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  groupId?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  position?: InputMaybe<Scalars['Int']['input']>;
  projectIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  repoId?: InputMaybe<Scalars['ID']['input']>;
  type?: InputMaybe<ChannelType>;
};

export type CreateChannelTerminalInput = {
  bridgeRuntimeId: Scalars['ID']['input'];
  channelId: Scalars['ID']['input'];
  cols: Scalars['Int']['input'];
  rows: Scalars['Int']['input'];
};

export type CreateChatInput = {
  memberIds: Array<Scalars['ID']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type CreateProjectInput = {
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  repoId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreateRepoInput = {
  defaultBranch?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  remoteUrl: Scalars['String']['input'];
};

export type CreateTicketInput = {
  assigneeIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  channelId?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  labels?: InputMaybe<Array<Scalars['String']['input']>>;
  organizationId: Scalars['ID']['input'];
  priority?: InputMaybe<Priority>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  title: Scalars['String']['input'];
};

export type DeliveryResult =
  | 'delivered'
  | 'delivery_failed'
  | 'no_runtime'
  | 'runtime_disconnected'
  | 'session_unbound';

export type EntityType =
  | 'channel'
  | 'chat'
  | 'message'
  | 'session'
  | 'ticket';

export type Event = {
  __typename?: 'Event';
  actor: Actor;
  eventType: EventType;
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  parentId?: Maybe<Scalars['ID']['output']>;
  payload: Scalars['JSON']['output'];
  scopeId: Scalars['ID']['output'];
  scopeType: ScopeType;
  timestamp: Scalars['DateTime']['output'];
};

export type EventType =
  | 'bridge_access_request_resolved'
  | 'bridge_access_requested'
  | 'bridge_access_revoked'
  | 'bridge_access_updated'
  | 'channel_created'
  | 'channel_deleted'
  | 'channel_group_created'
  | 'channel_group_deleted'
  | 'channel_group_updated'
  | 'channel_member_added'
  | 'channel_member_removed'
  | 'channel_updated'
  | 'chat_created'
  | 'chat_member_added'
  | 'chat_member_removed'
  | 'chat_renamed'
  | 'entity_linked'
  | 'inbox_item_created'
  | 'inbox_item_resolved'
  | 'member_joined'
  | 'member_left'
  | 'message_deleted'
  | 'message_edited'
  | 'message_sent'
  | 'queued_message_added'
  | 'queued_message_removed'
  | 'queued_messages_cleared'
  | 'queued_messages_drained'
  | 'repo_created'
  | 'repo_updated'
  | 'session_deleted'
  | 'session_group_archived'
  | 'session_output'
  | 'session_paused'
  | 'session_pr_closed'
  | 'session_pr_merged'
  | 'session_pr_opened'
  | 'session_resumed'
  | 'session_started'
  | 'session_terminated'
  | 'ticket_assigned'
  | 'ticket_commented'
  | 'ticket_created'
  | 'ticket_linked'
  | 'ticket_unassigned'
  | 'ticket_unlinked'
  | 'ticket_updated';

export type ExecutionDisposition =
  | 'act'
  | 'escalate'
  | 'ignore'
  | 'suggest'
  | 'summarize';

export type ExecutionLogFilters = {
  disposition?: InputMaybe<ExecutionDisposition>;
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  status?: InputMaybe<ExecutionStatus>;
};

export type ExecutionStatus =
  | 'blocked'
  | 'dropped'
  | 'failed'
  | 'succeeded'
  | 'suggested';

export type GitCheckpoint = {
  __typename?: 'GitCheckpoint';
  author: Scalars['String']['output'];
  commitSha: Scalars['String']['output'];
  committedAt: Scalars['DateTime']['output'];
  createdAt: Scalars['DateTime']['output'];
  filesChanged: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  parentShas: Array<Scalars['String']['output']>;
  promptEvent?: Maybe<Event>;
  promptEventId: Scalars['ID']['output'];
  repo?: Maybe<Repo>;
  repoId: Scalars['ID']['output'];
  session?: Maybe<Session>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupId: Scalars['ID']['output'];
  sessionId: Scalars['ID']['output'];
  subject: Scalars['String']['output'];
  treeSha: Scalars['String']['output'];
};

export type HostingMode =
  | 'cloud'
  | 'local';

export type InboxItem = {
  __typename?: 'InboxItem';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  itemType: InboxItemType;
  payload: Scalars['JSON']['output'];
  resolvedAt?: Maybe<Scalars['DateTime']['output']>;
  sourceId: Scalars['ID']['output'];
  sourceType: Scalars['String']['output'];
  status: InboxItemStatus;
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  userId: Scalars['ID']['output'];
};

export type InboxItemStatus =
  | 'active'
  | 'dismissed'
  | 'expired'
  | 'resolved';

export type InboxItemType =
  | 'agent_escalation'
  | 'agent_suggestion'
  | 'comment_suggestion'
  | 'field_change_suggestion'
  | 'link_suggestion'
  | 'message_suggestion'
  | 'plan'
  | 'question'
  | 'session_suggestion'
  | 'ticket_suggestion';

export type LinkedCheckoutActionResult = {
  __typename?: 'LinkedCheckoutActionResult';
  error?: Maybe<Scalars['String']['output']>;
  ok: Scalars['Boolean']['output'];
  status: LinkedCheckoutStatus;
};

export type LinkedCheckoutStatus = {
  __typename?: 'LinkedCheckoutStatus';
  attachedSessionGroup?: Maybe<SessionGroup>;
  attachedSessionGroupId?: Maybe<Scalars['ID']['output']>;
  autoSyncEnabled: Scalars['Boolean']['output'];
  currentBranch?: Maybe<Scalars['String']['output']>;
  currentCommitSha?: Maybe<Scalars['String']['output']>;
  isAttached: Scalars['Boolean']['output'];
  lastSyncError?: Maybe<Scalars['String']['output']>;
  lastSyncedCommitSha?: Maybe<Scalars['String']['output']>;
  repo?: Maybe<Repo>;
  repoId: Scalars['ID']['output'];
  repoPath?: Maybe<Scalars['String']['output']>;
  restoreBranch?: Maybe<Scalars['String']['output']>;
  restoreCommitSha?: Maybe<Scalars['String']['output']>;
  targetBranch?: Maybe<Scalars['String']['output']>;
};

export type Message = {
  __typename?: 'Message';
  actor: Actor;
  channelId?: Maybe<Scalars['ID']['output']>;
  chatId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  editedAt?: Maybe<Scalars['DateTime']['output']>;
  html?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  latestReplyAt?: Maybe<Scalars['DateTime']['output']>;
  mentions?: Maybe<Scalars['JSON']['output']>;
  parentMessageId?: Maybe<Scalars['ID']['output']>;
  replyCount: Scalars['Int']['output'];
  text: Scalars['String']['output'];
  threadRepliers: Array<Actor>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ModelTier =
  | 'tier2'
  | 'tier3';

export type MoveChannelInput = {
  channelId: Scalars['ID']['input'];
  groupId?: InputMaybe<Scalars['ID']['input']>;
  position: Scalars['Int']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  acceptAgentSuggestion: InboxItem;
  addChatMember: Chat;
  addOrgMember: OrgMember;
  approveBridgeAccessRequest: BridgeAccessGrant;
  archiveSessionGroup: SessionGroup;
  assignTicket: Ticket;
  clearQueuedMessages: Scalars['Boolean']['output'];
  commentOnTicket: Event;
  createAiConversation: AiConversation;
  createChannel: Channel;
  createChannelGroup: ChannelGroup;
  createChannelTerminal: Terminal;
  createChat: Chat;
  createProject: Project;
  createRepo: Repo;
  createTerminal: Terminal;
  createTicket: Ticket;
  deleteApiToken: Scalars['Boolean']['output'];
  deleteChannel: Scalars['Boolean']['output'];
  deleteChannelGroup: Scalars['Boolean']['output'];
  deleteChannelMessage: Message;
  deleteChatMessage: Message;
  deleteSession: Session;
  deleteSessionGroup: Scalars['Boolean']['output'];
  denyBridgeAccessRequest: BridgeAccessRequest;
  destroyTerminal: Scalars['Boolean']['output'];
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
  queueSessionMessage: QueuedMessage;
  registerPushToken: Scalars['Boolean']['output'];
  registerRepoWebhook: Repo;
  removeOrgMember: Scalars['Boolean']['output'];
  removeQueuedMessage: Scalars['Boolean']['output'];
  renameChat: Chat;
  reorderChannelGroups: Array<ChannelGroup>;
  reorderChannels: Array<Channel>;
  requestBridgeAccess: BridgeAccessRequest;
  restoreLinkedCheckout: LinkedCheckoutActionResult;
  retrySessionConnection: Session;
  retrySessionGroupSetup: SessionGroup;
  revokeBridgeAccessGrant: BridgeAccessGrant;
  runSession: Session;
  sendChannelMessage: Message;
  sendChatMessage: Message;
  sendMessage: Event;
  sendSessionMessage: Event;
  sendTurn: Turn;
  setApiToken: ApiTokenStatus;
  setLinkedCheckoutAutoSync: LinkedCheckoutActionResult;
  startSession: Session;
  subscribe: Participant;
  syncLinkedCheckout: LinkedCheckoutActionResult;
  terminateSession: Session;
  unassignTicket: Ticket;
  unlinkTicket: Ticket;
  unmuteScope: Participant;
  unregisterPushToken: Scalars['Boolean']['output'];
  unregisterRepoWebhook: Repo;
  unsubscribe: Scalars['Boolean']['output'];
  updateAgentSettings: AgentIdentity;
  updateAiConversationTitle: AiConversation;
  updateBridgeAccessGrant: BridgeAccessGrant;
  updateChannel: Channel;
  updateChannelGroup: ChannelGroup;
  updateOrgMemberRole: OrgMember;
  updateRepo: Repo;
  updateScopeAiMode: Scalars['Boolean']['output'];
  updateSessionConfig: Session;
  updateTicket: Ticket;
};


export type MutationAcceptAgentSuggestionArgs = {
  edits?: InputMaybe<Scalars['JSON']['input']>;
  inboxItemId: Scalars['ID']['input'];
};


export type MutationAddChatMemberArgs = {
  input: AddChatMemberInput;
};


export type MutationAddOrgMemberArgs = {
  organizationId: Scalars['ID']['input'];
  role?: InputMaybe<UserRole>;
  userId: Scalars['ID']['input'];
};


export type MutationApproveBridgeAccessRequestArgs = {
  capabilities?: InputMaybe<Array<BridgeAccessCapability>>;
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  requestId: Scalars['ID']['input'];
  scopeType?: InputMaybe<BridgeAccessScopeType>;
  sessionGroupId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationArchiveSessionGroupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationAssignTicketArgs = {
  ticketId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationClearQueuedMessagesArgs = {
  sessionId: Scalars['ID']['input'];
};


export type MutationCommentOnTicketArgs = {
  text: Scalars['String']['input'];
  ticketId: Scalars['ID']['input'];
};


export type MutationCreateAiConversationArgs = {
  input: CreateAiConversationInput;
  organizationId: Scalars['ID']['input'];
};


export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};


export type MutationCreateChannelGroupArgs = {
  input: CreateChannelGroupInput;
};


export type MutationCreateChannelTerminalArgs = {
  input: CreateChannelTerminalInput;
};


export type MutationCreateChatArgs = {
  input: CreateChatInput;
};


export type MutationCreateProjectArgs = {
  input: CreateProjectInput;
};


export type MutationCreateRepoArgs = {
  input: CreateRepoInput;
};


export type MutationCreateTerminalArgs = {
  cols: Scalars['Int']['input'];
  rows: Scalars['Int']['input'];
  sessionId: Scalars['ID']['input'];
};


export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};


export type MutationDeleteApiTokenArgs = {
  provider: ApiTokenProvider;
};


export type MutationDeleteChannelArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteChannelGroupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteChannelMessageArgs = {
  messageId: Scalars['ID']['input'];
};


export type MutationDeleteChatMessageArgs = {
  messageId: Scalars['ID']['input'];
};


export type MutationDeleteSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteSessionGroupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDenyBridgeAccessRequestArgs = {
  requestId: Scalars['ID']['input'];
};


export type MutationDestroyTerminalArgs = {
  terminalId: Scalars['ID']['input'];
};


export type MutationDismissAgentSuggestionArgs = {
  inboxItemId: Scalars['ID']['input'];
};


export type MutationDismissInboxItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDismissSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationEditChannelMessageArgs = {
  html: Scalars['String']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationEditChatMessageArgs = {
  html: Scalars['String']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationJoinChannelArgs = {
  channelId: Scalars['ID']['input'];
};


export type MutationLeaveChannelArgs = {
  channelId: Scalars['ID']['input'];
};


export type MutationLeaveChatArgs = {
  chatId: Scalars['ID']['input'];
};


export type MutationLinkEntityToProjectArgs = {
  entityId: Scalars['ID']['input'];
  entityType: EntityType;
  projectId: Scalars['ID']['input'];
};


export type MutationLinkLinkedCheckoutRepoArgs = {
  localPath: Scalars['String']['input'];
  repoId: Scalars['ID']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type MutationLinkTicketArgs = {
  entityId: Scalars['ID']['input'];
  entityType: EntityType;
  ticketId: Scalars['ID']['input'];
};


export type MutationMoveChannelArgs = {
  input: MoveChannelInput;
};


export type MutationMoveSessionToCloudArgs = {
  sessionId: Scalars['ID']['input'];
};


export type MutationMoveSessionToRuntimeArgs = {
  runtimeInstanceId: Scalars['ID']['input'];
  sessionId: Scalars['ID']['input'];
};


export type MutationMuteScopeArgs = {
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type MutationQueueSessionMessageArgs = {
  interactionMode?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationRegisterPushTokenArgs = {
  platform: PushPlatform;
  token: Scalars['String']['input'];
};


export type MutationRegisterRepoWebhookArgs = {
  repoId: Scalars['ID']['input'];
};


export type MutationRemoveOrgMemberArgs = {
  organizationId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationRemoveQueuedMessageArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRenameChatArgs = {
  chatId: Scalars['ID']['input'];
  name: Scalars['String']['input'];
};


export type MutationReorderChannelGroupsArgs = {
  input: ReorderChannelGroupsInput;
};


export type MutationReorderChannelsArgs = {
  input: ReorderChannelsInput;
};


export type MutationRequestBridgeAccessArgs = {
  requestedCapabilities?: InputMaybe<Array<BridgeAccessCapability>>;
  requestedExpiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  runtimeInstanceId: Scalars['ID']['input'];
  scopeType: BridgeAccessScopeType;
  sessionGroupId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationRestoreLinkedCheckoutArgs = {
  repoId: Scalars['ID']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type MutationRetrySessionConnectionArgs = {
  sessionId: Scalars['ID']['input'];
};


export type MutationRetrySessionGroupSetupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRevokeBridgeAccessGrantArgs = {
  grantId: Scalars['ID']['input'];
};


export type MutationRunSessionArgs = {
  id: Scalars['ID']['input'];
  interactionMode?: InputMaybe<Scalars['String']['input']>;
  prompt?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSendChannelMessageArgs = {
  channelId: Scalars['ID']['input'];
  html?: InputMaybe<Scalars['String']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSendChatMessageArgs = {
  chatId: Scalars['ID']['input'];
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  html?: InputMaybe<Scalars['String']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSendMessageArgs = {
  channelId: Scalars['ID']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
  text: Scalars['String']['input'];
};


export type MutationSendSessionMessageArgs = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  imageKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  interactionMode?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationSendTurnArgs = {
  branchId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationSetApiTokenArgs = {
  input: SetApiTokenInput;
};


export type MutationSetLinkedCheckoutAutoSyncArgs = {
  enabled: Scalars['Boolean']['input'];
  repoId: Scalars['ID']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type MutationStartSessionArgs = {
  input: StartSessionInput;
};


export type MutationSubscribeArgs = {
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type MutationSyncLinkedCheckoutArgs = {
  autoSyncEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  branch: Scalars['String']['input'];
  commitSha?: InputMaybe<Scalars['String']['input']>;
  repoId: Scalars['ID']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type MutationTerminateSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUnassignTicketArgs = {
  ticketId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationUnlinkTicketArgs = {
  entityId: Scalars['ID']['input'];
  entityType: EntityType;
  ticketId: Scalars['ID']['input'];
};


export type MutationUnmuteScopeArgs = {
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type MutationUnregisterPushTokenArgs = {
  token: Scalars['String']['input'];
};


export type MutationUnregisterRepoWebhookArgs = {
  repoId: Scalars['ID']['input'];
};


export type MutationUnsubscribeArgs = {
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type MutationUpdateAgentSettingsArgs = {
  input: UpdateAgentSettingsInput;
  organizationId: Scalars['ID']['input'];
};


export type MutationUpdateAiConversationTitleArgs = {
  conversationId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationUpdateBridgeAccessGrantArgs = {
  capabilities: Array<BridgeAccessCapability>;
  grantId: Scalars['ID']['input'];
};


export type MutationUpdateChannelArgs = {
  id: Scalars['ID']['input'];
  input: UpdateChannelInput;
};


export type MutationUpdateChannelGroupArgs = {
  id: Scalars['ID']['input'];
  input: UpdateChannelGroupInput;
};


export type MutationUpdateOrgMemberRoleArgs = {
  organizationId: Scalars['ID']['input'];
  role: UserRole;
  userId: Scalars['ID']['input'];
};


export type MutationUpdateRepoArgs = {
  id: Scalars['ID']['input'];
  input: UpdateRepoInput;
};


export type MutationUpdateScopeAiModeArgs = {
  aiMode?: InputMaybe<AutonomyMode>;
  organizationId: Scalars['ID']['input'];
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type MutationUpdateSessionConfigArgs = {
  hosting?: InputMaybe<HostingMode>;
  model?: InputMaybe<Scalars['String']['input']>;
  runtimeInstanceId?: InputMaybe<Scalars['ID']['input']>;
  sessionId: Scalars['ID']['input'];
  tool?: InputMaybe<CodingTool>;
};


export type MutationUpdateTicketArgs = {
  id: Scalars['ID']['input'];
  input: UpdateTicketInput;
};

export type Notification = {
  __typename?: 'Notification';
  id: Scalars['ID']['output'];
  message: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  type: Scalars['String']['output'];
};

export type OrgAgentStatus =
  | 'disabled'
  | 'enabled';

export type OrgMember = {
  __typename?: 'OrgMember';
  joinedAt: Scalars['DateTime']['output'];
  organization: Organization;
  role: UserRole;
  user: User;
};

export type Organization = {
  __typename?: 'Organization';
  channels: Array<Channel>;
  id: Scalars['ID']['output'];
  members: Array<OrgMember>;
  name: Scalars['String']['output'];
  projects: Array<Project>;
  repos: Array<Repo>;
};

export type Participant = {
  __typename?: 'Participant';
  muted: Scalars['Boolean']['output'];
  scopeId: Scalars['ID']['output'];
  scopeType: Scalars['String']['output'];
  subscribedAt: Scalars['DateTime']['output'];
  user: User;
  userId: Scalars['ID']['output'];
};

export type PortEndpoint = {
  __typename?: 'PortEndpoint';
  label: Scalars['String']['output'];
  port: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type Priority =
  | 'high'
  | 'low'
  | 'medium'
  | 'urgent';

export type Project = {
  __typename?: 'Project';
  aiMode?: Maybe<AutonomyMode>;
  channels: Array<Channel>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  tickets: Array<Ticket>;
};

export type PushPlatform =
  | 'android'
  | 'ios';

export type Query = {
  __typename?: 'Query';
  agentAggregationWindows: Array<AggregationWindowInfo>;
  agentCostSummary: AgentCostSummary;
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
  channelAvailableBridges: Array<ChannelBridgeOption>;
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
  myOrganizations: Array<OrgMember>;
  mySessions: Array<Session>;
  organization?: Maybe<Organization>;
  participants: Array<Participant>;
  project?: Maybe<Project>;
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  repoBranches: Array<Scalars['String']['output']>;
  repos: Array<Repo>;
  resolvedAiMode: AutonomyMode;
  searchSessions: SessionSearchResults;
  searchUsers: Array<User>;
  session?: Maybe<Session>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupBranchDiff: Array<BranchDiffFile>;
  sessionGroupFileAtRef: Scalars['String']['output'];
  sessionGroupFileContent: Scalars['String']['output'];
  sessionGroupFiles: Array<Scalars['String']['output']>;
  sessionGroups: Array<SessionGroup>;
  sessionSlashCommands: Array<SlashCommand>;
  sessionTerminals: Array<Terminal>;
  sessions: Array<Session>;
  threadReplies: Array<Message>;
  threadSummary?: Maybe<ThreadSummary>;
  ticket?: Maybe<Ticket>;
  tickets: Array<Ticket>;
};


export type QueryAgentAggregationWindowsArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryAgentCostSummaryArgs = {
  endDate: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  startDate: Scalars['String']['input'];
};


export type QueryAgentExecutionLogArgs = {
  id: Scalars['ID']['input'];
  organizationId: Scalars['ID']['input'];
};


export type QueryAgentExecutionLogsArgs = {
  filters?: InputMaybe<ExecutionLogFilters>;
  organizationId: Scalars['ID']['input'];
};


export type QueryAgentIdentityArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryAgentWorkerStatusArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryAiConversationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryAiConversationsArgs = {
  organizationId: Scalars['ID']['input'];
  visibility?: InputMaybe<AiConversationVisibility>;
};


export type QueryAvailableRuntimesArgs = {
  sessionGroupId?: InputMaybe<Scalars['ID']['input']>;
  tool: CodingTool;
};


export type QueryAvailableSessionRuntimesArgs = {
  sessionId: Scalars['ID']['input'];
};


export type QueryBranchArgs = {
  id: Scalars['ID']['input'];
};


export type QueryBridgeRuntimeAccessArgs = {
  runtimeInstanceId: Scalars['ID']['input'];
  sessionGroupId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChannelAvailableBridgesArgs = {
  channelId: Scalars['ID']['input'];
};


export type QueryChannelGroupsArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryChannelMessagesArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryChannelTerminalsArgs = {
  channelId: Scalars['ID']['input'];
};


export type QueryChannelsArgs = {
  memberOnly?: InputMaybe<Scalars['Boolean']['input']>;
  organizationId: Scalars['ID']['input'];
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryChatArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChatMessagesArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
  chatId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryEventsArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
  excludePayloadTypes?: InputMaybe<Array<Scalars['String']['input']>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  organizationId: Scalars['ID']['input'];
  scope?: InputMaybe<ScopeInput>;
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryInboxItemsArgs = {
  organizationId: Scalars['ID']['input'];
  status?: InputMaybe<InboxItemStatus>;
};


export type QueryLinkedCheckoutStatusArgs = {
  repoId: Scalars['ID']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type QueryMySessionsArgs = {
  agentStatus?: InputMaybe<AgentStatus>;
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  includeMerged?: InputMaybe<Scalars['Boolean']['input']>;
  organizationId: Scalars['ID']['input'];
};


export type QueryOrganizationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryParticipantsArgs = {
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type QueryProjectArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProjectsArgs = {
  organizationId: Scalars['ID']['input'];
  repoId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryRepoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRepoBranchesArgs = {
  repoId: Scalars['ID']['input'];
  runtimeInstanceId?: InputMaybe<Scalars['ID']['input']>;
  sessionGroupId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryReposArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryResolvedAiModeArgs = {
  organizationId: Scalars['ID']['input'];
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
};


export type QuerySearchSessionsArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  query: Scalars['String']['input'];
};


export type QuerySearchUsersArgs = {
  query: Scalars['String']['input'];
};


export type QuerySessionArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySessionGroupArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySessionGroupBranchDiffArgs = {
  sessionGroupId: Scalars['ID']['input'];
};


export type QuerySessionGroupFileAtRefArgs = {
  filePath: Scalars['String']['input'];
  ref: Scalars['String']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type QuerySessionGroupFileContentArgs = {
  filePath: Scalars['String']['input'];
  sessionGroupId: Scalars['ID']['input'];
};


export type QuerySessionGroupFilesArgs = {
  sessionGroupId: Scalars['ID']['input'];
};


export type QuerySessionGroupsArgs = {
  archived?: InputMaybe<Scalars['Boolean']['input']>;
  channelId: Scalars['ID']['input'];
  status?: InputMaybe<SessionGroupStatus>;
};


export type QuerySessionSlashCommandsArgs = {
  sessionId: Scalars['ID']['input'];
};


export type QuerySessionTerminalsArgs = {
  sessionId: Scalars['ID']['input'];
};


export type QuerySessionsArgs = {
  filters?: InputMaybe<SessionFilters>;
  organizationId: Scalars['ID']['input'];
};


export type QueryThreadRepliesArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  rootMessageId: Scalars['ID']['input'];
};


export type QueryThreadSummaryArgs = {
  rootMessageId: Scalars['ID']['input'];
};


export type QueryTicketArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTicketsArgs = {
  filters?: InputMaybe<TicketFilters>;
  organizationId: Scalars['ID']['input'];
};

export type QueuedMessage = {
  __typename?: 'QueuedMessage';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  interactionMode?: Maybe<Scalars['String']['output']>;
  position: Scalars['Int']['output'];
  sessionId: Scalars['ID']['output'];
  text: Scalars['String']['output'];
};

export type ReorderChannelGroupsInput = {
  groupIds: Array<Scalars['ID']['input']>;
  organizationId: Scalars['ID']['input'];
};

export type ReorderChannelsInput = {
  channelIds: Array<Scalars['ID']['input']>;
  groupId?: InputMaybe<Scalars['ID']['input']>;
};

export type Repo = {
  __typename?: 'Repo';
  defaultBranch: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  projects: Array<Project>;
  remoteUrl: Scalars['String']['output'];
  sessions: Array<Session>;
  webhookActive: Scalars['Boolean']['output'];
};

export type ScopeInput = {
  id: Scalars['ID']['input'];
  type: ScopeType;
};

export type ScopeType =
  | 'channel'
  | 'chat'
  | 'session'
  | 'system'
  | 'ticket';

export type Session = {
  __typename?: 'Session';
  agentStatus: AgentStatus;
  branch?: Maybe<Scalars['String']['output']>;
  channel?: Maybe<Channel>;
  connection?: Maybe<SessionConnection>;
  createdAt: Scalars['DateTime']['output'];
  createdBy: User;
  endpoints?: Maybe<SessionEndpoints>;
  gitCheckpoints: Array<GitCheckpoint>;
  hosting: HostingMode;
  id: Scalars['ID']['output'];
  lastMessageAt?: Maybe<Scalars['DateTime']['output']>;
  lastUserMessageAt?: Maybe<Scalars['DateTime']['output']>;
  model?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  prUrl?: Maybe<Scalars['String']['output']>;
  projects: Array<Project>;
  queuedMessages: Array<QueuedMessage>;
  repo?: Maybe<Repo>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupId?: Maybe<Scalars['ID']['output']>;
  sessionStatus: SessionStatus;
  tickets: Array<Ticket>;
  tool: CodingTool;
  toolSessionId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  workdir?: Maybe<Scalars['String']['output']>;
  worktreeDeleted: Scalars['Boolean']['output'];
};

export type SessionConnection = {
  __typename?: 'SessionConnection';
  /**
   * When false, the frontend should not auto-retry the connection — only manual
   * Retry/Move can unblock. Used for non-transient failures like the home bridge
   * being offline, where repeated retries produce noise without progress.
   */
  autoRetryable?: Maybe<Scalars['Boolean']['output']>;
  canMove: Scalars['Boolean']['output'];
  canRetry: Scalars['Boolean']['output'];
  lastDeliveryFailureAt?: Maybe<Scalars['DateTime']['output']>;
  lastError?: Maybe<Scalars['String']['output']>;
  lastSeen?: Maybe<Scalars['DateTime']['output']>;
  retryCount: Scalars['Int']['output'];
  runtimeInstanceId?: Maybe<Scalars['String']['output']>;
  runtimeLabel?: Maybe<Scalars['String']['output']>;
  state: SessionConnectionState;
};

export type SessionConnectionState =
  | 'connected'
  | 'degraded'
  | 'disconnected';

export type SessionEndpoints = {
  __typename?: 'SessionEndpoints';
  ports: Array<PortEndpoint>;
  terminals: Array<TerminalEndpoint>;
};

export type SessionFilters = {
  agentStatus?: InputMaybe<AgentStatus>;
  channelId?: InputMaybe<Scalars['ID']['input']>;
  repoId?: InputMaybe<Scalars['ID']['input']>;
  tool?: InputMaybe<CodingTool>;
};

export type SessionGroup = {
  __typename?: 'SessionGroup';
  archivedAt?: Maybe<Scalars['DateTime']['output']>;
  branch?: Maybe<Scalars['String']['output']>;
  channel?: Maybe<Channel>;
  connection?: Maybe<SessionConnection>;
  createdAt: Scalars['DateTime']['output'];
  gitCheckpoints: Array<GitCheckpoint>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  prUrl?: Maybe<Scalars['String']['output']>;
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  setupError?: Maybe<Scalars['String']['output']>;
  setupStatus: SetupStatus;
  slug?: Maybe<Scalars['String']['output']>;
  status: SessionGroupStatus;
  updatedAt: Scalars['DateTime']['output'];
  workdir?: Maybe<Scalars['String']['output']>;
  worktreeDeleted: Scalars['Boolean']['output'];
};

export type SessionGroupStatus =
  | 'archived'
  | 'failed'
  | 'in_progress'
  | 'in_review'
  | 'merged'
  | 'needs_input'
  | 'stopped';

export type SessionRuntimeInstance = {
  __typename?: 'SessionRuntimeInstance';
  connected: Scalars['Boolean']['output'];
  hostingMode: HostingMode;
  id: Scalars['ID']['output'];
  label: Scalars['String']['output'];
  registeredRepoIds: Array<Scalars['ID']['output']>;
  sessionCount: Scalars['Int']['output'];
  supportedTools: Array<CodingTool>;
};

export type SessionSearchResults = {
  __typename?: 'SessionSearchResults';
  sessionGroups: Array<SessionGroup>;
  sessions: Array<Session>;
};

export type SessionStatus =
  | 'in_progress'
  | 'in_review'
  | 'merged'
  | 'needs_input';

export type SetApiTokenInput = {
  provider: ApiTokenProvider;
  token: Scalars['String']['input'];
};

export type SetupStatus =
  | 'completed'
  | 'failed'
  | 'idle'
  | 'running';

export type SlashCommand = {
  __typename?: 'SlashCommand';
  category: SlashCommandCategory;
  description: Scalars['String']['output'];
  name: Scalars['String']['output'];
  source: SlashCommandSource;
};

export type SlashCommandCategory =
  | 'passthrough'
  | 'special'
  | 'terminal';

export type SlashCommandSource =
  | 'builtin'
  | 'project_skill'
  | 'user_skill';

export type StartSessionInput = {
  branch?: InputMaybe<Scalars['String']['input']>;
  channelId?: InputMaybe<Scalars['ID']['input']>;
  hosting?: InputMaybe<HostingMode>;
  interactionMode?: InputMaybe<Scalars['String']['input']>;
  model?: InputMaybe<Scalars['String']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  prompt?: InputMaybe<Scalars['String']['input']>;
  repoId?: InputMaybe<Scalars['ID']['input']>;
  restoreCheckpointId?: InputMaybe<Scalars['ID']['input']>;
  runtimeInstanceId?: InputMaybe<Scalars['ID']['input']>;
  sessionGroupId?: InputMaybe<Scalars['ID']['input']>;
  sourceSessionId?: InputMaybe<Scalars['ID']['input']>;
  ticketId?: InputMaybe<Scalars['ID']['input']>;
  tool: CodingTool;
};

export type Subscription = {
  __typename?: 'Subscription';
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
  branchId: Scalars['ID']['input'];
};


export type SubscriptionChannelEventsArgs = {
  channelId: Scalars['ID']['input'];
  organizationId: Scalars['ID']['input'];
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type SubscriptionChatEventsArgs = {
  chatId: Scalars['ID']['input'];
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type SubscriptionConversationEventsArgs = {
  conversationId: Scalars['ID']['input'];
};


export type SubscriptionOrgEventsArgs = {
  organizationId: Scalars['ID']['input'];
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type SubscriptionSessionEventsArgs = {
  organizationId: Scalars['ID']['input'];
  sessionId: Scalars['ID']['input'];
};


export type SubscriptionSessionPortsChangedArgs = {
  organizationId: Scalars['ID']['input'];
  sessionId: Scalars['ID']['input'];
};


export type SubscriptionSessionStatusChangedArgs = {
  organizationId: Scalars['ID']['input'];
  sessionId: Scalars['ID']['input'];
};


export type SubscriptionTicketEventsArgs = {
  organizationId: Scalars['ID']['input'];
  ticketId: Scalars['ID']['input'];
};


export type SubscriptionUserNotificationsArgs = {
  organizationId: Scalars['ID']['input'];
};

export type Terminal = {
  __typename?: 'Terminal';
  bridgeRuntimeId: Scalars['ID']['output'];
  channelId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  sessionId?: Maybe<Scalars['ID']['output']>;
};

export type TerminalEndpoint = {
  __typename?: 'TerminalEndpoint';
  id: Scalars['String']['output'];
  status: Scalars['String']['output'];
  wsUrl: Scalars['String']['output'];
};

export type ThreadSummary = {
  __typename?: 'ThreadSummary';
  lastReplyAt?: Maybe<Scalars['DateTime']['output']>;
  participantIds: Array<Scalars['ID']['output']>;
  replyCount: Scalars['Int']['output'];
  rootMessageId: Scalars['ID']['output'];
};

export type Ticket = {
  __typename?: 'Ticket';
  aiMode?: Maybe<AutonomyMode>;
  assignees: Array<User>;
  channel?: Maybe<Channel>;
  createdAt: Scalars['DateTime']['output'];
  createdBy: User;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  labels: Array<Scalars['String']['output']>;
  links: Array<TicketLink>;
  origin?: Maybe<Event>;
  priority: Priority;
  projects: Array<Project>;
  sessions: Array<Session>;
  status: TicketStatus;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TicketFilters = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
};

export type TicketLink = {
  __typename?: 'TicketLink';
  createdAt: Scalars['DateTime']['output'];
  entityId: Scalars['ID']['output'];
  entityType: EntityType;
  id: Scalars['ID']['output'];
};

export type TicketStatus =
  | 'backlog'
  | 'cancelled'
  | 'done'
  | 'in_progress'
  | 'in_review'
  | 'todo';

export type Turn = {
  __typename?: 'Turn';
  branch: Branch;
  branchCount: Scalars['Int']['output'];
  childBranches: Array<Branch>;
  content: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  parentTurn?: Maybe<Turn>;
  role: TurnRole;
};

export type TurnRole =
  | 'ASSISTANT'
  | 'USER';

export type UpdateAgentSettingsInput = {
  autonomyMode?: InputMaybe<AutonomyMode>;
  dailyLimitCents?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  soulFile?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<OrgAgentStatus>;
};

export type UpdateChannelGroupInput = {
  isCollapsed?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateChannelInput = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  runScripts?: InputMaybe<Scalars['JSON']['input']>;
  setupScript?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateRepoInput = {
  defaultBranch?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTicketInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  labels?: InputMaybe<Array<Scalars['String']['input']>>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  organizations: Array<OrgMember>;
};

export type UserRole =
  | 'admin'
  | 'member'
  | 'observer';
