import { JsonValue } from '../json';
import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { Context } from '../context';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
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
  attachedSessionGroupId?: Maybe<Scalars['ID']['output']>;
  autoSyncEnabled: Scalars['Boolean']['output'];
  currentBranch?: Maybe<Scalars['String']['output']>;
  currentCommitSha?: Maybe<Scalars['String']['output']>;
  isAttached: Scalars['Boolean']['output'];
  lastSyncError?: Maybe<Scalars['String']['output']>;
  lastSyncedCommitSha?: Maybe<Scalars['String']['output']>;
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
  archiveSessionGroup: SessionGroup;
  assignTicket: Ticket;
  clearQueuedMessages: Scalars['Boolean']['output'];
  commentOnTicket: Event;
  createAiConversation: AiConversation;
  createChannel: Channel;
  createChannelGroup: ChannelGroup;
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
  registerRepoWebhook: Repo;
  removeOrgMember: Scalars['Boolean']['output'];
  removeQueuedMessage: Scalars['Boolean']['output'];
  renameChat: Chat;
  reorderChannelGroups: Array<ChannelGroup>;
  reorderChannels: Array<Channel>;
  restoreLinkedCheckout: LinkedCheckoutActionResult;
  retrySessionConnection: Session;
  retrySessionGroupSetup: SessionGroup;
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
  unregisterRepoWebhook: Repo;
  unsubscribe: Scalars['Boolean']['output'];
  updateAgentSettings: AgentIdentity;
  updateAiConversationTitle: AiConversation;
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
  channel?: Maybe<Channel>;
  channelGroups: Array<ChannelGroup>;
  channelMessages: Array<Message>;
  channels: Array<Channel>;
  chat?: Maybe<Chat>;
  chatMessages: Array<Message>;
  chats: Array<Chat>;
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
  linkedCheckoutStatus: LinkedCheckoutStatus;
  myApiTokens: Array<ApiTokenStatus>;
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
  searchUsers: Array<User>;
  session?: Maybe<Session>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupBranchDiff: Array<BranchDiffFile>;
  sessionGroupFileAtRef: Scalars['String']['output'];
  sessionGroupFileContent: Scalars['String']['output'];
  sessionGroupFiles: Array<Scalars['String']['output']>;
  sessionGroupLatestCheckpoint?: Maybe<GitCheckpoint>;
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
  tool: CodingTool;
};


export type QueryAvailableSessionRuntimesArgs = {
  sessionId: Scalars['ID']['input'];
};


export type QueryBranchArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
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
};


export type QueryReposArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryResolvedAiModeArgs = {
  organizationId: Scalars['ID']['input'];
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
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


export type QuerySessionGroupLatestCheckpointArgs = {
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
  id: Scalars['ID']['output'];
  sessionId: Scalars['ID']['output'];
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

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  Actor: ResolverTypeWrapper<Actor>;
  ActorType: ActorType;
  AddChatMemberInput: AddChatMemberInput;
  AgentBudgetStatus: ResolverTypeWrapper<AgentBudgetStatus>;
  AgentCostEntry: ResolverTypeWrapper<AgentCostEntry>;
  AgentCostSummary: ResolverTypeWrapper<AgentCostSummary>;
  AgentExecutionLog: ResolverTypeWrapper<AgentExecutionLog>;
  AgentExecutionLogConnection: ResolverTypeWrapper<AgentExecutionLogConnection>;
  AgentIdentity: ResolverTypeWrapper<AgentIdentity>;
  AgentLlmCall: ResolverTypeWrapper<AgentLlmCall>;
  AgentStatus: AgentStatus;
  AgentTrustLevel: AgentTrustLevel;
  AgentWorkerStatus: ResolverTypeWrapper<AgentWorkerStatus>;
  AggregationWindowInfo: ResolverTypeWrapper<AggregationWindowInfo>;
  AiConversation: ResolverTypeWrapper<AiConversation>;
  AiConversationEvent: ResolverTypeWrapper<AiConversationEvent>;
  AiConversationVisibility: AiConversationVisibility;
  ApiTokenProvider: ApiTokenProvider;
  ApiTokenStatus: ResolverTypeWrapper<ApiTokenStatus>;
  AutonomyMode: AutonomyMode;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Branch: ResolverTypeWrapper<Branch>;
  BranchDiffFile: ResolverTypeWrapper<BranchDiffFile>;
  Channel: ResolverTypeWrapper<Channel>;
  ChannelGroup: ResolverTypeWrapper<ChannelGroup>;
  ChannelMember: ResolverTypeWrapper<ChannelMember>;
  ChannelType: ChannelType;
  Chat: ResolverTypeWrapper<Chat>;
  ChatMember: ResolverTypeWrapper<ChatMember>;
  ChatType: ChatType;
  CodingTool: CodingTool;
  CostBudget: ResolverTypeWrapper<CostBudget>;
  CreateAiConversationInput: CreateAiConversationInput;
  CreateChannelGroupInput: CreateChannelGroupInput;
  CreateChannelInput: CreateChannelInput;
  CreateChatInput: CreateChatInput;
  CreateProjectInput: CreateProjectInput;
  CreateRepoInput: CreateRepoInput;
  CreateTicketInput: CreateTicketInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DeliveryResult: DeliveryResult;
  EntityType: EntityType;
  Event: ResolverTypeWrapper<Event>;
  EventType: EventType;
  ExecutionDisposition: ExecutionDisposition;
  ExecutionLogFilters: ExecutionLogFilters;
  ExecutionStatus: ExecutionStatus;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  GitCheckpoint: ResolverTypeWrapper<GitCheckpoint>;
  HostingMode: HostingMode;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  InboxItem: ResolverTypeWrapper<InboxItem>;
  InboxItemStatus: InboxItemStatus;
  InboxItemType: InboxItemType;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  LinkedCheckoutActionResult: ResolverTypeWrapper<LinkedCheckoutActionResult>;
  LinkedCheckoutStatus: ResolverTypeWrapper<LinkedCheckoutStatus>;
  Message: ResolverTypeWrapper<Message>;
  ModelTier: ModelTier;
  MoveChannelInput: MoveChannelInput;
  Mutation: ResolverTypeWrapper<{}>;
  Notification: ResolverTypeWrapper<Notification>;
  OrgAgentStatus: OrgAgentStatus;
  OrgMember: ResolverTypeWrapper<OrgMember>;
  Organization: ResolverTypeWrapper<Organization>;
  Participant: ResolverTypeWrapper<Participant>;
  PortEndpoint: ResolverTypeWrapper<PortEndpoint>;
  Priority: Priority;
  Project: ResolverTypeWrapper<Project>;
  Query: ResolverTypeWrapper<{}>;
  QueuedMessage: ResolverTypeWrapper<QueuedMessage>;
  ReorderChannelGroupsInput: ReorderChannelGroupsInput;
  ReorderChannelsInput: ReorderChannelsInput;
  Repo: ResolverTypeWrapper<Repo>;
  ScopeInput: ScopeInput;
  ScopeType: ScopeType;
  Session: ResolverTypeWrapper<Session>;
  SessionConnection: ResolverTypeWrapper<SessionConnection>;
  SessionConnectionState: SessionConnectionState;
  SessionEndpoints: ResolverTypeWrapper<SessionEndpoints>;
  SessionFilters: SessionFilters;
  SessionGroup: ResolverTypeWrapper<SessionGroup>;
  SessionGroupStatus: SessionGroupStatus;
  SessionRuntimeInstance: ResolverTypeWrapper<SessionRuntimeInstance>;
  SessionStatus: SessionStatus;
  SetApiTokenInput: SetApiTokenInput;
  SetupStatus: SetupStatus;
  SlashCommand: ResolverTypeWrapper<SlashCommand>;
  SlashCommandCategory: SlashCommandCategory;
  SlashCommandSource: SlashCommandSource;
  StartSessionInput: StartSessionInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Subscription: ResolverTypeWrapper<{}>;
  Terminal: ResolverTypeWrapper<Terminal>;
  TerminalEndpoint: ResolverTypeWrapper<TerminalEndpoint>;
  ThreadSummary: ResolverTypeWrapper<ThreadSummary>;
  Ticket: ResolverTypeWrapper<Ticket>;
  TicketFilters: TicketFilters;
  TicketLink: ResolverTypeWrapper<TicketLink>;
  TicketStatus: TicketStatus;
  Turn: ResolverTypeWrapper<Turn>;
  TurnRole: TurnRole;
  UpdateAgentSettingsInput: UpdateAgentSettingsInput;
  UpdateChannelGroupInput: UpdateChannelGroupInput;
  UpdateChannelInput: UpdateChannelInput;
  UpdateRepoInput: UpdateRepoInput;
  UpdateTicketInput: UpdateTicketInput;
  User: ResolverTypeWrapper<User>;
  UserRole: UserRole;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Actor: Actor;
  AddChatMemberInput: AddChatMemberInput;
  AgentBudgetStatus: AgentBudgetStatus;
  AgentCostEntry: AgentCostEntry;
  AgentCostSummary: AgentCostSummary;
  AgentExecutionLog: AgentExecutionLog;
  AgentExecutionLogConnection: AgentExecutionLogConnection;
  AgentIdentity: AgentIdentity;
  AgentLlmCall: AgentLlmCall;
  AgentWorkerStatus: AgentWorkerStatus;
  AggregationWindowInfo: AggregationWindowInfo;
  AiConversation: AiConversation;
  AiConversationEvent: AiConversationEvent;
  ApiTokenStatus: ApiTokenStatus;
  Boolean: Scalars['Boolean']['output'];
  Branch: Branch;
  BranchDiffFile: BranchDiffFile;
  Channel: Channel;
  ChannelGroup: ChannelGroup;
  ChannelMember: ChannelMember;
  Chat: Chat;
  ChatMember: ChatMember;
  CostBudget: CostBudget;
  CreateAiConversationInput: CreateAiConversationInput;
  CreateChannelGroupInput: CreateChannelGroupInput;
  CreateChannelInput: CreateChannelInput;
  CreateChatInput: CreateChatInput;
  CreateProjectInput: CreateProjectInput;
  CreateRepoInput: CreateRepoInput;
  CreateTicketInput: CreateTicketInput;
  DateTime: Scalars['DateTime']['output'];
  Event: Event;
  ExecutionLogFilters: ExecutionLogFilters;
  Float: Scalars['Float']['output'];
  GitCheckpoint: GitCheckpoint;
  ID: Scalars['ID']['output'];
  InboxItem: InboxItem;
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  LinkedCheckoutActionResult: LinkedCheckoutActionResult;
  LinkedCheckoutStatus: LinkedCheckoutStatus;
  Message: Message;
  MoveChannelInput: MoveChannelInput;
  Mutation: {};
  Notification: Notification;
  OrgMember: OrgMember;
  Organization: Organization;
  Participant: Participant;
  PortEndpoint: PortEndpoint;
  Project: Project;
  Query: {};
  QueuedMessage: QueuedMessage;
  ReorderChannelGroupsInput: ReorderChannelGroupsInput;
  ReorderChannelsInput: ReorderChannelsInput;
  Repo: Repo;
  ScopeInput: ScopeInput;
  Session: Session;
  SessionConnection: SessionConnection;
  SessionEndpoints: SessionEndpoints;
  SessionFilters: SessionFilters;
  SessionGroup: SessionGroup;
  SessionRuntimeInstance: SessionRuntimeInstance;
  SetApiTokenInput: SetApiTokenInput;
  SlashCommand: SlashCommand;
  StartSessionInput: StartSessionInput;
  String: Scalars['String']['output'];
  Subscription: {};
  Terminal: Terminal;
  TerminalEndpoint: TerminalEndpoint;
  ThreadSummary: ThreadSummary;
  Ticket: Ticket;
  TicketFilters: TicketFilters;
  TicketLink: TicketLink;
  Turn: Turn;
  UpdateAgentSettingsInput: UpdateAgentSettingsInput;
  UpdateChannelGroupInput: UpdateChannelGroupInput;
  UpdateChannelInput: UpdateChannelInput;
  UpdateRepoInput: UpdateRepoInput;
  UpdateTicketInput: UpdateTicketInput;
  User: User;
}>;

export type ActorResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Actor'] = ResolversParentTypes['Actor']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['ActorType'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentBudgetStatusResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentBudgetStatus'] = ResolversParentTypes['AgentBudgetStatus']> = ResolversObject<{
  dailyLimitCents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  remainingCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  remainingPercent?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  spentCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentCostEntryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentCostEntry'] = ResolversParentTypes['AgentCostEntry']> = ResolversObject<{
  date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  summaryCalls?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  summaryCostCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  tier2Calls?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tier2CostCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  tier3Calls?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tier3CostCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  totalCostCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentCostSummaryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentCostSummary'] = ResolversParentTypes['AgentCostSummary']> = ResolversObject<{
  budget?: Resolver<ResolversTypes['AgentBudgetStatus'], ParentType, ContextType>;
  dailyCosts?: Resolver<Array<ResolversTypes['AgentCostEntry']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentExecutionLogResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentExecutionLog'] = ResolversParentTypes['AgentExecutionLog']> = ResolversObject<{
  agentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  batchSize?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  confidence?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  contextTokenAllocation?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  disposition?: Resolver<ResolversTypes['ExecutionDisposition'], ParentType, ContextType>;
  estimatedCostCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  finalActions?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inboxItemId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  inputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  latencyMs?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  llmCalls?: Resolver<Array<ResolversTypes['AgentLlmCall']>, ParentType, ContextType>;
  model?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  modelTier?: Resolver<ResolversTypes['ModelTier'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  outputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  plannedActions?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  policyDecision?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  promoted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  promotionReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ExecutionStatus'], ParentType, ContextType>;
  triggerEventId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentExecutionLogConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentExecutionLogConnection'] = ResolversParentTypes['AgentExecutionLogConnection']> = ResolversObject<{
  items?: Resolver<Array<ResolversTypes['AgentExecutionLog']>, ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentIdentityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentIdentity'] = ResolversParentTypes['AgentIdentity']> = ResolversObject<{
  autonomyMode?: Resolver<ResolversTypes['AutonomyMode'], ParentType, ContextType>;
  costBudget?: Resolver<ResolversTypes['CostBudget'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  soulFile?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['OrgAgentStatus'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentLlmCallResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentLlmCall'] = ResolversParentTypes['AgentLlmCall']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  estimatedCostCents?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  executionLogId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  latencyMs?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  maxTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  messages?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  model?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  provider?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  responseContent?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  stopReason?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  systemPrompt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  temperature?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  tools?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  turnNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AgentWorkerStatusResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentWorkerStatus'] = ResolversParentTypes['AgentWorkerStatus']> = ResolversObject<{
  activeOrganizations?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  openAggregationWindows?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  running?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  uptime?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AggregationWindowInfoResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AggregationWindowInfo'] = ResolversParentTypes['AggregationWindowInfo']> = ResolversObject<{
  eventCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  lastEventAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  openedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  scopeKey?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AiConversationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AiConversation'] = ResolversParentTypes['AiConversation']> = ResolversObject<{
  branchCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  branches?: Resolver<Array<ResolversTypes['Branch']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  rootBranch?: Resolver<ResolversTypes['Branch'], ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  visibility?: Resolver<ResolversTypes['AiConversationVisibility'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AiConversationEventResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AiConversationEvent'] = ResolversParentTypes['AiConversationEvent']> = ResolversObject<{
  conversationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  payload?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ApiTokenStatusResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ApiTokenStatus'] = ResolversParentTypes['ApiTokenStatus']> = ResolversObject<{
  isSet?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  provider?: Resolver<ResolversTypes['ApiTokenProvider'], ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type BranchResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Branch'] = ResolversParentTypes['Branch']> = ResolversObject<{
  childBranches?: Resolver<Array<ResolversTypes['Branch']>, ParentType, ContextType>;
  conversation?: Resolver<ResolversTypes['AiConversation'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  depth?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  forkTurn?: Resolver<Maybe<ResolversTypes['Turn']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  label?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  parentBranch?: Resolver<Maybe<ResolversTypes['Branch']>, ParentType, ContextType>;
  turnCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  turns?: Resolver<Array<ResolversTypes['Turn']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type BranchDiffFileResolvers<ContextType = Context, ParentType extends ResolversParentTypes['BranchDiffFile'] = ResolversParentTypes['BranchDiffFile']> = ResolversObject<{
  additions?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  deletions?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  path?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChannelResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Channel'] = ResolversParentTypes['Channel']> = ResolversObject<{
  aiMode?: Resolver<Maybe<ResolversTypes['AutonomyMode']>, ParentType, ContextType>;
  baseBranch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  groupId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['ChannelMember']>, ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, Partial<ChannelMessagesArgs>>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  position?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  runScripts?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  setupScript?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['ChannelType'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChannelGroupResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ChannelGroup'] = ResolversParentTypes['ChannelGroup']> = ResolversObject<{
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isCollapsed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  position?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChannelMemberResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ChannelMember'] = ResolversParentTypes['ChannelMember']> = ResolversObject<{
  joinedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChatResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Chat'] = ResolversParentTypes['Chat']> = ResolversObject<{
  aiMode?: Resolver<Maybe<ResolversTypes['AutonomyMode']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['ChatMember']>, ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, Partial<ChatMessagesArgs>>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['ChatType'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChatMemberResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ChatMember'] = ResolversParentTypes['ChatMember']> = ResolversObject<{
  joinedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CostBudgetResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CostBudget'] = ResolversParentTypes['CostBudget']> = ResolversObject<{
  dailyLimitCents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type EventResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Event'] = ResolversParentTypes['Event']> = ResolversObject<{
  actor?: Resolver<ResolversTypes['Actor'], ParentType, ContextType>;
  eventType?: Resolver<ResolversTypes['EventType'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  parentId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  payload?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  scopeId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  scopeType?: Resolver<ResolversTypes['ScopeType'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type GitCheckpointResolvers<ContextType = Context, ParentType extends ResolversParentTypes['GitCheckpoint'] = ResolversParentTypes['GitCheckpoint']> = ResolversObject<{
  author?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  commitSha?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  committedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  filesChanged?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  parentShas?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  promptEvent?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType>;
  promptEventId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  repoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  sessionGroup?: Resolver<Maybe<ResolversTypes['SessionGroup']>, ParentType, ContextType>;
  sessionGroupId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  subject?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  treeSha?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type InboxItemResolvers<ContextType = Context, ParentType extends ResolversParentTypes['InboxItem'] = ResolversParentTypes['InboxItem']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  itemType?: Resolver<ResolversTypes['InboxItemType'], ParentType, ContextType>;
  payload?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  resolvedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  sourceId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sourceType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['InboxItemStatus'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type LinkedCheckoutActionResultResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LinkedCheckoutActionResult'] = ResolversParentTypes['LinkedCheckoutActionResult']> = ResolversObject<{
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ok?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LinkedCheckoutStatus'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type LinkedCheckoutStatusResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LinkedCheckoutStatus'] = ResolversParentTypes['LinkedCheckoutStatus']> = ResolversObject<{
  attachedSessionGroupId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  autoSyncEnabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  currentBranch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  currentCommitSha?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isAttached?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  lastSyncError?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastSyncedCommitSha?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  repoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  repoPath?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  restoreBranch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  restoreCommitSha?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  targetBranch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MessageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Message'] = ResolversParentTypes['Message']> = ResolversObject<{
  actor?: Resolver<ResolversTypes['Actor'], ParentType, ContextType>;
  channelId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  chatId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  editedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  html?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  latestReplyAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  mentions?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  parentMessageId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  replyCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  threadRepliers?: Resolver<Array<ResolversTypes['Actor']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  acceptAgentSuggestion?: Resolver<ResolversTypes['InboxItem'], ParentType, ContextType, RequireFields<MutationAcceptAgentSuggestionArgs, 'inboxItemId'>>;
  addChatMember?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationAddChatMemberArgs, 'input'>>;
  addOrgMember?: Resolver<ResolversTypes['OrgMember'], ParentType, ContextType, RequireFields<MutationAddOrgMemberArgs, 'organizationId' | 'userId'>>;
  archiveSessionGroup?: Resolver<ResolversTypes['SessionGroup'], ParentType, ContextType, RequireFields<MutationArchiveSessionGroupArgs, 'id'>>;
  assignTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationAssignTicketArgs, 'ticketId' | 'userId'>>;
  clearQueuedMessages?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationClearQueuedMessagesArgs, 'sessionId'>>;
  commentOnTicket?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationCommentOnTicketArgs, 'text' | 'ticketId'>>;
  createAiConversation?: Resolver<ResolversTypes['AiConversation'], ParentType, ContextType, RequireFields<MutationCreateAiConversationArgs, 'input' | 'organizationId'>>;
  createChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationCreateChannelArgs, 'input'>>;
  createChannelGroup?: Resolver<ResolversTypes['ChannelGroup'], ParentType, ContextType, RequireFields<MutationCreateChannelGroupArgs, 'input'>>;
  createChat?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationCreateChatArgs, 'input'>>;
  createProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationCreateProjectArgs, 'input'>>;
  createRepo?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationCreateRepoArgs, 'input'>>;
  createTerminal?: Resolver<ResolversTypes['Terminal'], ParentType, ContextType, RequireFields<MutationCreateTerminalArgs, 'cols' | 'rows' | 'sessionId'>>;
  createTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationCreateTicketArgs, 'input'>>;
  deleteApiToken?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteApiTokenArgs, 'provider'>>;
  deleteChannel?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteChannelArgs, 'id'>>;
  deleteChannelGroup?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteChannelGroupArgs, 'id'>>;
  deleteChannelMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationDeleteChannelMessageArgs, 'messageId'>>;
  deleteChatMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationDeleteChatMessageArgs, 'messageId'>>;
  deleteSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationDeleteSessionArgs, 'id'>>;
  deleteSessionGroup?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteSessionGroupArgs, 'id'>>;
  destroyTerminal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDestroyTerminalArgs, 'terminalId'>>;
  dismissAgentSuggestion?: Resolver<ResolversTypes['InboxItem'], ParentType, ContextType, RequireFields<MutationDismissAgentSuggestionArgs, 'inboxItemId'>>;
  dismissInboxItem?: Resolver<ResolversTypes['InboxItem'], ParentType, ContextType, RequireFields<MutationDismissInboxItemArgs, 'id'>>;
  dismissSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationDismissSessionArgs, 'id'>>;
  editChannelMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationEditChannelMessageArgs, 'html' | 'messageId'>>;
  editChatMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationEditChatMessageArgs, 'html' | 'messageId'>>;
  joinChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationJoinChannelArgs, 'channelId'>>;
  leaveChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationLeaveChannelArgs, 'channelId'>>;
  leaveChat?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationLeaveChatArgs, 'chatId'>>;
  linkEntityToProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationLinkEntityToProjectArgs, 'entityId' | 'entityType' | 'projectId'>>;
  linkLinkedCheckoutRepo?: Resolver<ResolversTypes['LinkedCheckoutActionResult'], ParentType, ContextType, RequireFields<MutationLinkLinkedCheckoutRepoArgs, 'localPath' | 'repoId' | 'sessionGroupId'>>;
  linkTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationLinkTicketArgs, 'entityId' | 'entityType' | 'ticketId'>>;
  moveChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationMoveChannelArgs, 'input'>>;
  moveSessionToCloud?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationMoveSessionToCloudArgs, 'sessionId'>>;
  moveSessionToRuntime?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationMoveSessionToRuntimeArgs, 'runtimeInstanceId' | 'sessionId'>>;
  muteScope?: Resolver<ResolversTypes['Participant'], ParentType, ContextType, RequireFields<MutationMuteScopeArgs, 'scopeId' | 'scopeType'>>;
  queueSessionMessage?: Resolver<ResolversTypes['QueuedMessage'], ParentType, ContextType, RequireFields<MutationQueueSessionMessageArgs, 'sessionId' | 'text'>>;
  registerRepoWebhook?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationRegisterRepoWebhookArgs, 'repoId'>>;
  removeOrgMember?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRemoveOrgMemberArgs, 'organizationId' | 'userId'>>;
  removeQueuedMessage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRemoveQueuedMessageArgs, 'id'>>;
  renameChat?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationRenameChatArgs, 'chatId' | 'name'>>;
  reorderChannelGroups?: Resolver<Array<ResolversTypes['ChannelGroup']>, ParentType, ContextType, RequireFields<MutationReorderChannelGroupsArgs, 'input'>>;
  reorderChannels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<MutationReorderChannelsArgs, 'input'>>;
  restoreLinkedCheckout?: Resolver<ResolversTypes['LinkedCheckoutActionResult'], ParentType, ContextType, RequireFields<MutationRestoreLinkedCheckoutArgs, 'repoId' | 'sessionGroupId'>>;
  retrySessionConnection?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationRetrySessionConnectionArgs, 'sessionId'>>;
  retrySessionGroupSetup?: Resolver<ResolversTypes['SessionGroup'], ParentType, ContextType, RequireFields<MutationRetrySessionGroupSetupArgs, 'id'>>;
  runSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationRunSessionArgs, 'id'>>;
  sendChannelMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationSendChannelMessageArgs, 'channelId'>>;
  sendChatMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationSendChatMessageArgs, 'chatId'>>;
  sendMessage?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationSendMessageArgs, 'channelId' | 'text'>>;
  sendSessionMessage?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationSendSessionMessageArgs, 'sessionId' | 'text'>>;
  sendTurn?: Resolver<ResolversTypes['Turn'], ParentType, ContextType, RequireFields<MutationSendTurnArgs, 'branchId' | 'content'>>;
  setApiToken?: Resolver<ResolversTypes['ApiTokenStatus'], ParentType, ContextType, RequireFields<MutationSetApiTokenArgs, 'input'>>;
  setLinkedCheckoutAutoSync?: Resolver<ResolversTypes['LinkedCheckoutActionResult'], ParentType, ContextType, RequireFields<MutationSetLinkedCheckoutAutoSyncArgs, 'enabled' | 'repoId' | 'sessionGroupId'>>;
  startSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationStartSessionArgs, 'input'>>;
  subscribe?: Resolver<ResolversTypes['Participant'], ParentType, ContextType, RequireFields<MutationSubscribeArgs, 'scopeId' | 'scopeType'>>;
  syncLinkedCheckout?: Resolver<ResolversTypes['LinkedCheckoutActionResult'], ParentType, ContextType, RequireFields<MutationSyncLinkedCheckoutArgs, 'branch' | 'repoId' | 'sessionGroupId'>>;
  terminateSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationTerminateSessionArgs, 'id'>>;
  unassignTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationUnassignTicketArgs, 'ticketId' | 'userId'>>;
  unlinkTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationUnlinkTicketArgs, 'entityId' | 'entityType' | 'ticketId'>>;
  unmuteScope?: Resolver<ResolversTypes['Participant'], ParentType, ContextType, RequireFields<MutationUnmuteScopeArgs, 'scopeId' | 'scopeType'>>;
  unregisterRepoWebhook?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationUnregisterRepoWebhookArgs, 'repoId'>>;
  unsubscribe?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationUnsubscribeArgs, 'scopeId' | 'scopeType'>>;
  updateAgentSettings?: Resolver<ResolversTypes['AgentIdentity'], ParentType, ContextType, RequireFields<MutationUpdateAgentSettingsArgs, 'input' | 'organizationId'>>;
  updateAiConversationTitle?: Resolver<ResolversTypes['AiConversation'], ParentType, ContextType, RequireFields<MutationUpdateAiConversationTitleArgs, 'conversationId' | 'title'>>;
  updateChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationUpdateChannelArgs, 'id' | 'input'>>;
  updateChannelGroup?: Resolver<ResolversTypes['ChannelGroup'], ParentType, ContextType, RequireFields<MutationUpdateChannelGroupArgs, 'id' | 'input'>>;
  updateOrgMemberRole?: Resolver<ResolversTypes['OrgMember'], ParentType, ContextType, RequireFields<MutationUpdateOrgMemberRoleArgs, 'organizationId' | 'role' | 'userId'>>;
  updateRepo?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationUpdateRepoArgs, 'id' | 'input'>>;
  updateScopeAiMode?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationUpdateScopeAiModeArgs, 'organizationId' | 'scopeId' | 'scopeType'>>;
  updateSessionConfig?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationUpdateSessionConfigArgs, 'sessionId'>>;
  updateTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationUpdateTicketArgs, 'id' | 'input'>>;
}>;

export type NotificationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Notification'] = ResolversParentTypes['Notification']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type OrgMemberResolvers<ContextType = Context, ParentType extends ResolversParentTypes['OrgMember'] = ResolversParentTypes['OrgMember']> = ResolversObject<{
  joinedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  organization?: Resolver<ResolversTypes['Organization'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['UserRole'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type OrganizationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Organization'] = ResolversParentTypes['Organization']> = ResolversObject<{
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['OrgMember']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  repos?: Resolver<Array<ResolversTypes['Repo']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ParticipantResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Participant'] = ResolversParentTypes['Participant']> = ResolversObject<{
  muted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  scopeId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  scopeType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  subscribedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PortEndpointResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PortEndpoint'] = ResolversParentTypes['PortEndpoint']> = ResolversObject<{
  label?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  port?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ProjectResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Project'] = ResolversParentTypes['Project']> = ResolversObject<{
  aiMode?: Resolver<Maybe<ResolversTypes['AutonomyMode']>, ParentType, ContextType>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  agentAggregationWindows?: Resolver<Array<ResolversTypes['AggregationWindowInfo']>, ParentType, ContextType, RequireFields<QueryAgentAggregationWindowsArgs, 'organizationId'>>;
  agentCostSummary?: Resolver<ResolversTypes['AgentCostSummary'], ParentType, ContextType, RequireFields<QueryAgentCostSummaryArgs, 'endDate' | 'organizationId' | 'startDate'>>;
  agentExecutionLog?: Resolver<Maybe<ResolversTypes['AgentExecutionLog']>, ParentType, ContextType, RequireFields<QueryAgentExecutionLogArgs, 'id' | 'organizationId'>>;
  agentExecutionLogs?: Resolver<ResolversTypes['AgentExecutionLogConnection'], ParentType, ContextType, RequireFields<QueryAgentExecutionLogsArgs, 'organizationId'>>;
  agentIdentity?: Resolver<Maybe<ResolversTypes['AgentIdentity']>, ParentType, ContextType, RequireFields<QueryAgentIdentityArgs, 'organizationId'>>;
  agentWorkerStatus?: Resolver<ResolversTypes['AgentWorkerStatus'], ParentType, ContextType, RequireFields<QueryAgentWorkerStatusArgs, 'organizationId'>>;
  aiConversation?: Resolver<Maybe<ResolversTypes['AiConversation']>, ParentType, ContextType, RequireFields<QueryAiConversationArgs, 'id'>>;
  aiConversations?: Resolver<Array<ResolversTypes['AiConversation']>, ParentType, ContextType, RequireFields<QueryAiConversationsArgs, 'organizationId'>>;
  availableRuntimes?: Resolver<Array<ResolversTypes['SessionRuntimeInstance']>, ParentType, ContextType, RequireFields<QueryAvailableRuntimesArgs, 'tool'>>;
  availableSessionRuntimes?: Resolver<Array<ResolversTypes['SessionRuntimeInstance']>, ParentType, ContextType, RequireFields<QueryAvailableSessionRuntimesArgs, 'sessionId'>>;
  branch?: Resolver<Maybe<ResolversTypes['Branch']>, ParentType, ContextType, RequireFields<QueryBranchArgs, 'id'>>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QueryChannelArgs, 'id'>>;
  channelGroups?: Resolver<Array<ResolversTypes['ChannelGroup']>, ParentType, ContextType, RequireFields<QueryChannelGroupsArgs, 'organizationId'>>;
  channelMessages?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, RequireFields<QueryChannelMessagesArgs, 'channelId'>>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QueryChannelsArgs, 'organizationId'>>;
  chat?: Resolver<Maybe<ResolversTypes['Chat']>, ParentType, ContextType, RequireFields<QueryChatArgs, 'id'>>;
  chatMessages?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, RequireFields<QueryChatMessagesArgs, 'chatId'>>;
  chats?: Resolver<Array<ResolversTypes['Chat']>, ParentType, ContextType>;
  events?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryEventsArgs, 'organizationId'>>;
  inboxItems?: Resolver<Array<ResolversTypes['InboxItem']>, ParentType, ContextType, RequireFields<QueryInboxItemsArgs, 'organizationId'>>;
  linkedCheckoutStatus?: Resolver<ResolversTypes['LinkedCheckoutStatus'], ParentType, ContextType, RequireFields<QueryLinkedCheckoutStatusArgs, 'repoId' | 'sessionGroupId'>>;
  myApiTokens?: Resolver<Array<ResolversTypes['ApiTokenStatus']>, ParentType, ContextType>;
  myOrganizations?: Resolver<Array<ResolversTypes['OrgMember']>, ParentType, ContextType>;
  mySessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QueryMySessionsArgs, 'organizationId'>>;
  organization?: Resolver<Maybe<ResolversTypes['Organization']>, ParentType, ContextType, RequireFields<QueryOrganizationArgs, 'id'>>;
  participants?: Resolver<Array<ResolversTypes['Participant']>, ParentType, ContextType, RequireFields<QueryParticipantsArgs, 'scopeId' | 'scopeType'>>;
  project?: Resolver<Maybe<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectArgs, 'id'>>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectsArgs, 'organizationId'>>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType, RequireFields<QueryRepoArgs, 'id'>>;
  repoBranches?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QueryRepoBranchesArgs, 'repoId'>>;
  repos?: Resolver<Array<ResolversTypes['Repo']>, ParentType, ContextType, RequireFields<QueryReposArgs, 'organizationId'>>;
  resolvedAiMode?: Resolver<ResolversTypes['AutonomyMode'], ParentType, ContextType, RequireFields<QueryResolvedAiModeArgs, 'organizationId' | 'scopeId' | 'scopeType'>>;
  searchUsers?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType, RequireFields<QuerySearchUsersArgs, 'query'>>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerySessionArgs, 'id'>>;
  sessionGroup?: Resolver<Maybe<ResolversTypes['SessionGroup']>, ParentType, ContextType, RequireFields<QuerySessionGroupArgs, 'id'>>;
  sessionGroupBranchDiff?: Resolver<Array<ResolversTypes['BranchDiffFile']>, ParentType, ContextType, RequireFields<QuerySessionGroupBranchDiffArgs, 'sessionGroupId'>>;
  sessionGroupFileAtRef?: Resolver<ResolversTypes['String'], ParentType, ContextType, RequireFields<QuerySessionGroupFileAtRefArgs, 'filePath' | 'ref' | 'sessionGroupId'>>;
  sessionGroupFileContent?: Resolver<ResolversTypes['String'], ParentType, ContextType, RequireFields<QuerySessionGroupFileContentArgs, 'filePath' | 'sessionGroupId'>>;
  sessionGroupFiles?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QuerySessionGroupFilesArgs, 'sessionGroupId'>>;
  sessionGroupLatestCheckpoint?: Resolver<Maybe<ResolversTypes['GitCheckpoint']>, ParentType, ContextType, RequireFields<QuerySessionGroupLatestCheckpointArgs, 'sessionGroupId'>>;
  sessionGroups?: Resolver<Array<ResolversTypes['SessionGroup']>, ParentType, ContextType, RequireFields<QuerySessionGroupsArgs, 'channelId'>>;
  sessionSlashCommands?: Resolver<Array<ResolversTypes['SlashCommand']>, ParentType, ContextType, RequireFields<QuerySessionSlashCommandsArgs, 'sessionId'>>;
  sessionTerminals?: Resolver<Array<ResolversTypes['Terminal']>, ParentType, ContextType, RequireFields<QuerySessionTerminalsArgs, 'sessionId'>>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerySessionsArgs, 'organizationId'>>;
  threadReplies?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, RequireFields<QueryThreadRepliesArgs, 'rootMessageId'>>;
  threadSummary?: Resolver<Maybe<ResolversTypes['ThreadSummary']>, ParentType, ContextType, RequireFields<QueryThreadSummaryArgs, 'rootMessageId'>>;
  ticket?: Resolver<Maybe<ResolversTypes['Ticket']>, ParentType, ContextType, RequireFields<QueryTicketArgs, 'id'>>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType, RequireFields<QueryTicketsArgs, 'organizationId'>>;
}>;

export type QueuedMessageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['QueuedMessage'] = ResolversParentTypes['QueuedMessage']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  interactionMode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  position?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type RepoResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Repo'] = ResolversParentTypes['Repo']> = ResolversObject<{
  defaultBranch?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  remoteUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  webhookActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SessionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Session'] = ResolversParentTypes['Session']> = ResolversObject<{
  agentStatus?: Resolver<ResolversTypes['AgentStatus'], ParentType, ContextType>;
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType>;
  connection?: Resolver<Maybe<ResolversTypes['SessionConnection']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  endpoints?: Resolver<Maybe<ResolversTypes['SessionEndpoints']>, ParentType, ContextType>;
  gitCheckpoints?: Resolver<Array<ResolversTypes['GitCheckpoint']>, ParentType, ContextType>;
  hosting?: Resolver<ResolversTypes['HostingMode'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastMessageAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUserMessageAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  model?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  prUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  queuedMessages?: Resolver<Array<ResolversTypes['QueuedMessage']>, ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  sessionGroup?: Resolver<Maybe<ResolversTypes['SessionGroup']>, ParentType, ContextType>;
  sessionGroupId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  sessionStatus?: Resolver<ResolversTypes['SessionStatus'], ParentType, ContextType>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType>;
  tool?: Resolver<ResolversTypes['CodingTool'], ParentType, ContextType>;
  toolSessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  workdir?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  worktreeDeleted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SessionConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SessionConnection'] = ResolversParentTypes['SessionConnection']> = ResolversObject<{
  autoRetryable?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  canMove?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  canRetry?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  lastDeliveryFailureAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastError?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastSeen?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  retryCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  runtimeInstanceId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  runtimeLabel?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  state?: Resolver<ResolversTypes['SessionConnectionState'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SessionEndpointsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SessionEndpoints'] = ResolversParentTypes['SessionEndpoints']> = ResolversObject<{
  ports?: Resolver<Array<ResolversTypes['PortEndpoint']>, ParentType, ContextType>;
  terminals?: Resolver<Array<ResolversTypes['TerminalEndpoint']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SessionGroupResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SessionGroup'] = ResolversParentTypes['SessionGroup']> = ResolversObject<{
  archivedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType>;
  connection?: Resolver<Maybe<ResolversTypes['SessionConnection']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  gitCheckpoints?: Resolver<Array<ResolversTypes['GitCheckpoint']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  prUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  setupError?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  setupStatus?: Resolver<ResolversTypes['SetupStatus'], ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['SessionGroupStatus'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  workdir?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  worktreeDeleted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SessionRuntimeInstanceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SessionRuntimeInstance'] = ResolversParentTypes['SessionRuntimeInstance']> = ResolversObject<{
  connected?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hostingMode?: Resolver<ResolversTypes['HostingMode'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  label?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  registeredRepoIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  sessionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  supportedTools?: Resolver<Array<ResolversTypes['CodingTool']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SlashCommandResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SlashCommand'] = ResolversParentTypes['SlashCommand']> = ResolversObject<{
  category?: Resolver<ResolversTypes['SlashCommandCategory'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SlashCommandSource'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SubscriptionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = ResolversObject<{
  branchTurns?: SubscriptionResolver<ResolversTypes['Turn'], "branchTurns", ParentType, ContextType, RequireFields<SubscriptionBranchTurnsArgs, 'branchId'>>;
  channelEvents?: SubscriptionResolver<ResolversTypes['Event'], "channelEvents", ParentType, ContextType, RequireFields<SubscriptionChannelEventsArgs, 'channelId' | 'organizationId'>>;
  chatEvents?: SubscriptionResolver<ResolversTypes['Event'], "chatEvents", ParentType, ContextType, RequireFields<SubscriptionChatEventsArgs, 'chatId'>>;
  conversationEvents?: SubscriptionResolver<ResolversTypes['AiConversationEvent'], "conversationEvents", ParentType, ContextType, RequireFields<SubscriptionConversationEventsArgs, 'conversationId'>>;
  orgEvents?: SubscriptionResolver<ResolversTypes['Event'], "orgEvents", ParentType, ContextType, RequireFields<SubscriptionOrgEventsArgs, 'organizationId'>>;
  sessionEvents?: SubscriptionResolver<ResolversTypes['Event'], "sessionEvents", ParentType, ContextType, RequireFields<SubscriptionSessionEventsArgs, 'organizationId' | 'sessionId'>>;
  sessionPortsChanged?: SubscriptionResolver<ResolversTypes['SessionEndpoints'], "sessionPortsChanged", ParentType, ContextType, RequireFields<SubscriptionSessionPortsChangedArgs, 'organizationId' | 'sessionId'>>;
  sessionStatusChanged?: SubscriptionResolver<ResolversTypes['Session'], "sessionStatusChanged", ParentType, ContextType, RequireFields<SubscriptionSessionStatusChangedArgs, 'organizationId' | 'sessionId'>>;
  ticketEvents?: SubscriptionResolver<ResolversTypes['Event'], "ticketEvents", ParentType, ContextType, RequireFields<SubscriptionTicketEventsArgs, 'organizationId' | 'ticketId'>>;
  userNotifications?: SubscriptionResolver<ResolversTypes['Notification'], "userNotifications", ParentType, ContextType, RequireFields<SubscriptionUserNotificationsArgs, 'organizationId'>>;
}>;

export type TerminalResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Terminal'] = ResolversParentTypes['Terminal']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TerminalEndpointResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TerminalEndpoint'] = ResolversParentTypes['TerminalEndpoint']> = ResolversObject<{
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  wsUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ThreadSummaryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ThreadSummary'] = ResolversParentTypes['ThreadSummary']> = ResolversObject<{
  lastReplyAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  participantIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  replyCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  rootMessageId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TicketResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Ticket'] = ResolversParentTypes['Ticket']> = ResolversObject<{
  aiMode?: Resolver<Maybe<ResolversTypes['AutonomyMode']>, ParentType, ContextType>;
  assignees?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  labels?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  links?: Resolver<Array<ResolversTypes['TicketLink']>, ParentType, ContextType>;
  origin?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Priority'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['TicketStatus'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TicketLinkResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TicketLink'] = ResolversParentTypes['TicketLink']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  entityId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  entityType?: Resolver<ResolversTypes['EntityType'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TurnResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Turn'] = ResolversParentTypes['Turn']> = ResolversObject<{
  branch?: Resolver<ResolversTypes['Branch'], ParentType, ContextType>;
  branchCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  childBranches?: Resolver<Array<ResolversTypes['Branch']>, ParentType, ContextType>;
  content?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  parentTurn?: Resolver<Maybe<ResolversTypes['Turn']>, ParentType, ContextType>;
  role?: Resolver<ResolversTypes['TurnRole'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizations?: Resolver<Array<ResolversTypes['OrgMember']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = Context> = ResolversObject<{
  Actor?: ActorResolvers<ContextType>;
  AgentBudgetStatus?: AgentBudgetStatusResolvers<ContextType>;
  AgentCostEntry?: AgentCostEntryResolvers<ContextType>;
  AgentCostSummary?: AgentCostSummaryResolvers<ContextType>;
  AgentExecutionLog?: AgentExecutionLogResolvers<ContextType>;
  AgentExecutionLogConnection?: AgentExecutionLogConnectionResolvers<ContextType>;
  AgentIdentity?: AgentIdentityResolvers<ContextType>;
  AgentLlmCall?: AgentLlmCallResolvers<ContextType>;
  AgentWorkerStatus?: AgentWorkerStatusResolvers<ContextType>;
  AggregationWindowInfo?: AggregationWindowInfoResolvers<ContextType>;
  AiConversation?: AiConversationResolvers<ContextType>;
  AiConversationEvent?: AiConversationEventResolvers<ContextType>;
  ApiTokenStatus?: ApiTokenStatusResolvers<ContextType>;
  Branch?: BranchResolvers<ContextType>;
  BranchDiffFile?: BranchDiffFileResolvers<ContextType>;
  Channel?: ChannelResolvers<ContextType>;
  ChannelGroup?: ChannelGroupResolvers<ContextType>;
  ChannelMember?: ChannelMemberResolvers<ContextType>;
  Chat?: ChatResolvers<ContextType>;
  ChatMember?: ChatMemberResolvers<ContextType>;
  CostBudget?: CostBudgetResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  Event?: EventResolvers<ContextType>;
  GitCheckpoint?: GitCheckpointResolvers<ContextType>;
  InboxItem?: InboxItemResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  LinkedCheckoutActionResult?: LinkedCheckoutActionResultResolvers<ContextType>;
  LinkedCheckoutStatus?: LinkedCheckoutStatusResolvers<ContextType>;
  Message?: MessageResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Notification?: NotificationResolvers<ContextType>;
  OrgMember?: OrgMemberResolvers<ContextType>;
  Organization?: OrganizationResolvers<ContextType>;
  Participant?: ParticipantResolvers<ContextType>;
  PortEndpoint?: PortEndpointResolvers<ContextType>;
  Project?: ProjectResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  QueuedMessage?: QueuedMessageResolvers<ContextType>;
  Repo?: RepoResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  SessionConnection?: SessionConnectionResolvers<ContextType>;
  SessionEndpoints?: SessionEndpointsResolvers<ContextType>;
  SessionGroup?: SessionGroupResolvers<ContextType>;
  SessionRuntimeInstance?: SessionRuntimeInstanceResolvers<ContextType>;
  SlashCommand?: SlashCommandResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Terminal?: TerminalResolvers<ContextType>;
  TerminalEndpoint?: TerminalEndpointResolvers<ContextType>;
  ThreadSummary?: ThreadSummaryResolvers<ContextType>;
  Ticket?: TicketResolvers<ContextType>;
  TicketLink?: TicketLinkResolvers<ContextType>;
  Turn?: TurnResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
}>;

