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

export type AgentIdentity = {
  __typename?: 'AgentIdentity';
  autonomyMode: AutonomyMode;
  costBudget: CostBudget;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  organizationId: Scalars['ID']['output'];
  soulFile: Scalars['String']['output'];
  status: AgentStatus;
  updatedAt: Scalars['DateTime']['output'];
};

export type AgentStatus =
  | 'disabled'
  | 'enabled';

export type AgentTrustLevel =
  | 'autonomous'
  | 'blocked'
  | 'suggest';

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

export type Channel = {
  __typename?: 'Channel';
  groupId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  members: Array<User>;
  messages: Array<Event>;
  name: Scalars['String']['output'];
  position: Scalars['Int']['output'];
  projects: Array<Project>;
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

export type ChannelType =
  | 'announcement'
  | 'default'
  | 'feed'
  | 'triage';

export type Chat = {
  __typename?: 'Chat';
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

export type CreateChannelGroupInput = {
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  position?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateChannelInput = {
  groupId?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  position?: InputMaybe<Scalars['Int']['input']>;
  projectIds?: InputMaybe<Array<Scalars['ID']['input']>>;
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
  | 'channel_group_created'
  | 'channel_group_deleted'
  | 'channel_group_updated'
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
  | 'repo_created'
  | 'repo_updated'
  | 'session_deleted'
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
  | 'resolved';

export type InboxItemType =
  | 'plan'
  | 'question';

export type Message = {
  __typename?: 'Message';
  actor: Actor;
  chatId: Scalars['ID']['output'];
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

export type MoveChannelInput = {
  channelId: Scalars['ID']['input'];
  groupId?: InputMaybe<Scalars['ID']['input']>;
  position: Scalars['Int']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addChatMember: Chat;
  addOrgMember: OrgMember;
  assignTicket: Ticket;
  commentOnTicket: Event;
  createChannel: Channel;
  createChannelGroup: ChannelGroup;
  createChat: Chat;
  createProject: Project;
  createRepo: Repo;
  createTerminal: Terminal;
  createTicket: Ticket;
  deleteApiToken: Scalars['Boolean']['output'];
  deleteChannelGroup: Scalars['Boolean']['output'];
  deleteChatMessage: Message;
  deleteSession: Session;
  destroyTerminal: Scalars['Boolean']['output'];
  dismissInboxItem: InboxItem;
  dismissSession: Session;
  editChatMessage: Message;
  leaveChat: Chat;
  linkEntityToProject: Project;
  linkTicket: Ticket;
  moveChannel: Channel;
  moveSessionToCloud: Session;
  moveSessionToRuntime: Session;
  muteScope: Participant;
  pauseSession: Session;
  registerRepoWebhook: Repo;
  removeOrgMember: Scalars['Boolean']['output'];
  renameChat: Chat;
  reorderChannelGroups: Array<ChannelGroup>;
  reorderChannels: Array<Channel>;
  resumeSession: Session;
  retrySessionConnection: Session;
  runSession: Session;
  sendChatMessage: Message;
  sendMessage: Event;
  sendSessionMessage: Event;
  setApiToken: ApiTokenStatus;
  startSession: Session;
  subscribe: Participant;
  terminateSession: Session;
  unassignTicket: Ticket;
  unlinkTicket: Ticket;
  unmuteScope: Participant;
  unregisterRepoWebhook: Repo;
  unsubscribe: Scalars['Boolean']['output'];
  updateAgentSettings: AgentIdentity;
  updateChannelGroup: ChannelGroup;
  updateOrgMemberRole: OrgMember;
  updateRepo: Repo;
  updateSessionConfig: Session;
  updateTicket: Ticket;
};


export type MutationAddChatMemberArgs = {
  input: AddChatMemberInput;
};


export type MutationAddOrgMemberArgs = {
  organizationId: Scalars['ID']['input'];
  role?: InputMaybe<UserRole>;
  userId: Scalars['ID']['input'];
};


export type MutationAssignTicketArgs = {
  ticketId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationCommentOnTicketArgs = {
  text: Scalars['String']['input'];
  ticketId: Scalars['ID']['input'];
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


export type MutationDeleteChannelGroupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteChatMessageArgs = {
  messageId: Scalars['ID']['input'];
};


export type MutationDeleteSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDestroyTerminalArgs = {
  terminalId: Scalars['ID']['input'];
};


export type MutationDismissInboxItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDismissSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationEditChatMessageArgs = {
  html: Scalars['String']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationLeaveChatArgs = {
  chatId: Scalars['ID']['input'];
};


export type MutationLinkEntityToProjectArgs = {
  entityId: Scalars['ID']['input'];
  entityType: EntityType;
  projectId: Scalars['ID']['input'];
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


export type MutationPauseSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRegisterRepoWebhookArgs = {
  repoId: Scalars['ID']['input'];
};


export type MutationRemoveOrgMemberArgs = {
  organizationId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
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


export type MutationResumeSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRetrySessionConnectionArgs = {
  sessionId: Scalars['ID']['input'];
};


export type MutationRunSessionArgs = {
  id: Scalars['ID']['input'];
  interactionMode?: InputMaybe<Scalars['String']['input']>;
  prompt?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSendChatMessageArgs = {
  chatId: Scalars['ID']['input'];
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
  interactionMode?: InputMaybe<Scalars['String']['input']>;
  sessionId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationSetApiTokenArgs = {
  input: SetApiTokenInput;
};


export type MutationStartSessionArgs = {
  input: StartSessionInput;
};


export type MutationSubscribeArgs = {
  scopeId: Scalars['ID']['input'];
  scopeType: Scalars['String']['input'];
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


export type MutationUpdateSessionConfigArgs = {
  model?: InputMaybe<Scalars['String']['input']>;
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
  channels: Array<Channel>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  tickets: Array<Ticket>;
};

export type Query = {
  __typename?: 'Query';
  agentIdentity?: Maybe<AgentIdentity>;
  availableRuntimes: Array<SessionRuntimeInstance>;
  availableSessionRuntimes: Array<SessionRuntimeInstance>;
  channel?: Maybe<Channel>;
  channelGroups: Array<ChannelGroup>;
  channels: Array<Channel>;
  chat?: Maybe<Chat>;
  chatMessages: Array<Message>;
  chats: Array<Chat>;
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
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
  session?: Maybe<Session>;
  sessionTerminals: Array<Terminal>;
  sessions: Array<Session>;
  threadReplies: Array<Message>;
  threadSummary?: Maybe<ThreadSummary>;
  ticket?: Maybe<Ticket>;
  tickets: Array<Ticket>;
};


export type QueryAgentIdentityArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryAvailableRuntimesArgs = {
  tool: CodingTool;
};


export type QueryAvailableSessionRuntimesArgs = {
  sessionId: Scalars['ID']['input'];
};


export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChannelGroupsArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QueryChannelsArgs = {
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
  limit?: InputMaybe<Scalars['Int']['input']>;
  organizationId: Scalars['ID']['input'];
  scope?: InputMaybe<ScopeInput>;
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryInboxItemsArgs = {
  organizationId: Scalars['ID']['input'];
  status?: InputMaybe<InboxItemStatus>;
};


export type QueryMySessionsArgs = {
  organizationId: Scalars['ID']['input'];
  status?: InputMaybe<SessionStatus>;
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


export type QuerySessionArgs = {
  id: Scalars['ID']['input'];
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
  branch?: Maybe<Scalars['String']['output']>;
  channel?: Maybe<Channel>;
  childSessions: Array<Session>;
  connection?: Maybe<SessionConnection>;
  createdAt: Scalars['DateTime']['output'];
  createdBy: User;
  endpoints?: Maybe<SessionEndpoints>;
  hosting: HostingMode;
  id: Scalars['ID']['output'];
  model?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  parentSession?: Maybe<Session>;
  prUrl?: Maybe<Scalars['String']['output']>;
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  status: SessionStatus;
  tickets: Array<Ticket>;
  tool: CodingTool;
  toolSessionId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  workdir?: Maybe<Scalars['String']['output']>;
  worktreeDeleted: Scalars['Boolean']['output'];
};

export type SessionConnection = {
  __typename?: 'SessionConnection';
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
  channelId?: InputMaybe<Scalars['ID']['input']>;
  repoId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<SessionStatus>;
  tool?: InputMaybe<CodingTool>;
};

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
  | 'active'
  | 'completed'
  | 'creating'
  | 'failed'
  | 'merged'
  | 'needs_input'
  | 'paused'
  | 'pending'
  | 'unreachable';

export type SetApiTokenInput = {
  provider: ApiTokenProvider;
  token: Scalars['String']['input'];
};

export type StartSessionInput = {
  branch?: InputMaybe<Scalars['String']['input']>;
  channelId?: InputMaybe<Scalars['ID']['input']>;
  hosting?: InputMaybe<HostingMode>;
  model?: InputMaybe<Scalars['String']['input']>;
  parentSessionId?: InputMaybe<Scalars['ID']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  prompt?: InputMaybe<Scalars['String']['input']>;
  repoId?: InputMaybe<Scalars['ID']['input']>;
  runtimeInstanceId?: InputMaybe<Scalars['ID']['input']>;
  ticketId?: InputMaybe<Scalars['ID']['input']>;
  tool: CodingTool;
};

export type Subscription = {
  __typename?: 'Subscription';
  channelEvents: Event;
  chatEvents: Event;
  orgEvents: Event;
  sessionPortsChanged: SessionEndpoints;
  sessionStatusChanged: Session;
  ticketEvents: Event;
  userNotifications: Notification;
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


export type SubscriptionOrgEventsArgs = {
  organizationId: Scalars['ID']['input'];
  types?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type UpdateAgentSettingsInput = {
  autonomyMode?: InputMaybe<AutonomyMode>;
  dailyLimitCents?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  soulFile?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<AgentStatus>;
};

export type UpdateChannelGroupInput = {
  isCollapsed?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['Int']['input']>;
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
  AgentIdentity: ResolverTypeWrapper<AgentIdentity>;
  AgentStatus: AgentStatus;
  AgentTrustLevel: AgentTrustLevel;
  ApiTokenProvider: ApiTokenProvider;
  ApiTokenStatus: ResolverTypeWrapper<ApiTokenStatus>;
  AutonomyMode: AutonomyMode;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Channel: ResolverTypeWrapper<Channel>;
  ChannelGroup: ResolverTypeWrapper<ChannelGroup>;
  ChannelType: ChannelType;
  Chat: ResolverTypeWrapper<Chat>;
  ChatMember: ResolverTypeWrapper<ChatMember>;
  ChatType: ChatType;
  CodingTool: CodingTool;
  CostBudget: ResolverTypeWrapper<CostBudget>;
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
  HostingMode: HostingMode;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  InboxItem: ResolverTypeWrapper<InboxItem>;
  InboxItemStatus: InboxItemStatus;
  InboxItemType: InboxItemType;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Message: ResolverTypeWrapper<Message>;
  MoveChannelInput: MoveChannelInput;
  Mutation: ResolverTypeWrapper<{}>;
  Notification: ResolverTypeWrapper<Notification>;
  OrgMember: ResolverTypeWrapper<OrgMember>;
  Organization: ResolverTypeWrapper<Organization>;
  Participant: ResolverTypeWrapper<Participant>;
  PortEndpoint: ResolverTypeWrapper<PortEndpoint>;
  Priority: Priority;
  Project: ResolverTypeWrapper<Project>;
  Query: ResolverTypeWrapper<{}>;
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
  SessionRuntimeInstance: ResolverTypeWrapper<SessionRuntimeInstance>;
  SessionStatus: SessionStatus;
  SetApiTokenInput: SetApiTokenInput;
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
  UpdateAgentSettingsInput: UpdateAgentSettingsInput;
  UpdateChannelGroupInput: UpdateChannelGroupInput;
  UpdateRepoInput: UpdateRepoInput;
  UpdateTicketInput: UpdateTicketInput;
  User: ResolverTypeWrapper<User>;
  UserRole: UserRole;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Actor: Actor;
  AddChatMemberInput: AddChatMemberInput;
  AgentIdentity: AgentIdentity;
  ApiTokenStatus: ApiTokenStatus;
  Boolean: Scalars['Boolean']['output'];
  Channel: Channel;
  ChannelGroup: ChannelGroup;
  Chat: Chat;
  ChatMember: ChatMember;
  CostBudget: CostBudget;
  CreateChannelGroupInput: CreateChannelGroupInput;
  CreateChannelInput: CreateChannelInput;
  CreateChatInput: CreateChatInput;
  CreateProjectInput: CreateProjectInput;
  CreateRepoInput: CreateRepoInput;
  CreateTicketInput: CreateTicketInput;
  DateTime: Scalars['DateTime']['output'];
  Event: Event;
  ID: Scalars['ID']['output'];
  InboxItem: InboxItem;
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
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
  ReorderChannelGroupsInput: ReorderChannelGroupsInput;
  ReorderChannelsInput: ReorderChannelsInput;
  Repo: Repo;
  ScopeInput: ScopeInput;
  Session: Session;
  SessionConnection: SessionConnection;
  SessionEndpoints: SessionEndpoints;
  SessionFilters: SessionFilters;
  SessionRuntimeInstance: SessionRuntimeInstance;
  SetApiTokenInput: SetApiTokenInput;
  StartSessionInput: StartSessionInput;
  String: Scalars['String']['output'];
  Subscription: {};
  Terminal: Terminal;
  TerminalEndpoint: TerminalEndpoint;
  ThreadSummary: ThreadSummary;
  Ticket: Ticket;
  TicketFilters: TicketFilters;
  TicketLink: TicketLink;
  UpdateAgentSettingsInput: UpdateAgentSettingsInput;
  UpdateChannelGroupInput: UpdateChannelGroupInput;
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

export type AgentIdentityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AgentIdentity'] = ResolversParentTypes['AgentIdentity']> = ResolversObject<{
  autonomyMode?: Resolver<ResolversTypes['AutonomyMode'], ParentType, ContextType>;
  costBudget?: Resolver<ResolversTypes['CostBudget'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  soulFile?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['AgentStatus'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ApiTokenStatusResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ApiTokenStatus'] = ResolversParentTypes['ApiTokenStatus']> = ResolversObject<{
  isSet?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  provider?: Resolver<ResolversTypes['ApiTokenProvider'], ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChannelResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Channel'] = ResolversParentTypes['Channel']> = ResolversObject<{
  groupId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, Partial<ChannelMessagesArgs>>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  position?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
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

export type ChatResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Chat'] = ResolversParentTypes['Chat']> = ResolversObject<{
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

export type MessageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Message'] = ResolversParentTypes['Message']> = ResolversObject<{
  actor?: Resolver<ResolversTypes['Actor'], ParentType, ContextType>;
  chatId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  addChatMember?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationAddChatMemberArgs, 'input'>>;
  addOrgMember?: Resolver<ResolversTypes['OrgMember'], ParentType, ContextType, RequireFields<MutationAddOrgMemberArgs, 'organizationId' | 'userId'>>;
  assignTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationAssignTicketArgs, 'ticketId' | 'userId'>>;
  commentOnTicket?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationCommentOnTicketArgs, 'text' | 'ticketId'>>;
  createChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationCreateChannelArgs, 'input'>>;
  createChannelGroup?: Resolver<ResolversTypes['ChannelGroup'], ParentType, ContextType, RequireFields<MutationCreateChannelGroupArgs, 'input'>>;
  createChat?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationCreateChatArgs, 'input'>>;
  createProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationCreateProjectArgs, 'input'>>;
  createRepo?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationCreateRepoArgs, 'input'>>;
  createTerminal?: Resolver<ResolversTypes['Terminal'], ParentType, ContextType, RequireFields<MutationCreateTerminalArgs, 'cols' | 'rows' | 'sessionId'>>;
  createTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationCreateTicketArgs, 'input'>>;
  deleteApiToken?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteApiTokenArgs, 'provider'>>;
  deleteChannelGroup?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteChannelGroupArgs, 'id'>>;
  deleteChatMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationDeleteChatMessageArgs, 'messageId'>>;
  deleteSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationDeleteSessionArgs, 'id'>>;
  destroyTerminal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDestroyTerminalArgs, 'terminalId'>>;
  dismissInboxItem?: Resolver<ResolversTypes['InboxItem'], ParentType, ContextType, RequireFields<MutationDismissInboxItemArgs, 'id'>>;
  dismissSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationDismissSessionArgs, 'id'>>;
  editChatMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationEditChatMessageArgs, 'html' | 'messageId'>>;
  leaveChat?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationLeaveChatArgs, 'chatId'>>;
  linkEntityToProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationLinkEntityToProjectArgs, 'entityId' | 'entityType' | 'projectId'>>;
  linkTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationLinkTicketArgs, 'entityId' | 'entityType' | 'ticketId'>>;
  moveChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationMoveChannelArgs, 'input'>>;
  moveSessionToCloud?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationMoveSessionToCloudArgs, 'sessionId'>>;
  moveSessionToRuntime?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationMoveSessionToRuntimeArgs, 'runtimeInstanceId' | 'sessionId'>>;
  muteScope?: Resolver<ResolversTypes['Participant'], ParentType, ContextType, RequireFields<MutationMuteScopeArgs, 'scopeId' | 'scopeType'>>;
  pauseSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationPauseSessionArgs, 'id'>>;
  registerRepoWebhook?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationRegisterRepoWebhookArgs, 'repoId'>>;
  removeOrgMember?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRemoveOrgMemberArgs, 'organizationId' | 'userId'>>;
  renameChat?: Resolver<ResolversTypes['Chat'], ParentType, ContextType, RequireFields<MutationRenameChatArgs, 'chatId' | 'name'>>;
  reorderChannelGroups?: Resolver<Array<ResolversTypes['ChannelGroup']>, ParentType, ContextType, RequireFields<MutationReorderChannelGroupsArgs, 'input'>>;
  reorderChannels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<MutationReorderChannelsArgs, 'input'>>;
  resumeSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationResumeSessionArgs, 'id'>>;
  retrySessionConnection?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationRetrySessionConnectionArgs, 'sessionId'>>;
  runSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationRunSessionArgs, 'id'>>;
  sendChatMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationSendChatMessageArgs, 'chatId'>>;
  sendMessage?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationSendMessageArgs, 'channelId' | 'text'>>;
  sendSessionMessage?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationSendSessionMessageArgs, 'sessionId' | 'text'>>;
  setApiToken?: Resolver<ResolversTypes['ApiTokenStatus'], ParentType, ContextType, RequireFields<MutationSetApiTokenArgs, 'input'>>;
  startSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationStartSessionArgs, 'input'>>;
  subscribe?: Resolver<ResolversTypes['Participant'], ParentType, ContextType, RequireFields<MutationSubscribeArgs, 'scopeId' | 'scopeType'>>;
  terminateSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationTerminateSessionArgs, 'id'>>;
  unassignTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationUnassignTicketArgs, 'ticketId' | 'userId'>>;
  unlinkTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationUnlinkTicketArgs, 'entityId' | 'entityType' | 'ticketId'>>;
  unmuteScope?: Resolver<ResolversTypes['Participant'], ParentType, ContextType, RequireFields<MutationUnmuteScopeArgs, 'scopeId' | 'scopeType'>>;
  unregisterRepoWebhook?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationUnregisterRepoWebhookArgs, 'repoId'>>;
  unsubscribe?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationUnsubscribeArgs, 'scopeId' | 'scopeType'>>;
  updateAgentSettings?: Resolver<ResolversTypes['AgentIdentity'], ParentType, ContextType, RequireFields<MutationUpdateAgentSettingsArgs, 'input' | 'organizationId'>>;
  updateChannelGroup?: Resolver<ResolversTypes['ChannelGroup'], ParentType, ContextType, RequireFields<MutationUpdateChannelGroupArgs, 'id' | 'input'>>;
  updateOrgMemberRole?: Resolver<ResolversTypes['OrgMember'], ParentType, ContextType, RequireFields<MutationUpdateOrgMemberRoleArgs, 'organizationId' | 'role' | 'userId'>>;
  updateRepo?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationUpdateRepoArgs, 'id' | 'input'>>;
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
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  agentIdentity?: Resolver<Maybe<ResolversTypes['AgentIdentity']>, ParentType, ContextType, RequireFields<QueryAgentIdentityArgs, 'organizationId'>>;
  availableRuntimes?: Resolver<Array<ResolversTypes['SessionRuntimeInstance']>, ParentType, ContextType, RequireFields<QueryAvailableRuntimesArgs, 'tool'>>;
  availableSessionRuntimes?: Resolver<Array<ResolversTypes['SessionRuntimeInstance']>, ParentType, ContextType, RequireFields<QueryAvailableSessionRuntimesArgs, 'sessionId'>>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QueryChannelArgs, 'id'>>;
  channelGroups?: Resolver<Array<ResolversTypes['ChannelGroup']>, ParentType, ContextType, RequireFields<QueryChannelGroupsArgs, 'organizationId'>>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QueryChannelsArgs, 'organizationId'>>;
  chat?: Resolver<Maybe<ResolversTypes['Chat']>, ParentType, ContextType, RequireFields<QueryChatArgs, 'id'>>;
  chatMessages?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, RequireFields<QueryChatMessagesArgs, 'chatId'>>;
  chats?: Resolver<Array<ResolversTypes['Chat']>, ParentType, ContextType>;
  events?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryEventsArgs, 'organizationId'>>;
  inboxItems?: Resolver<Array<ResolversTypes['InboxItem']>, ParentType, ContextType, RequireFields<QueryInboxItemsArgs, 'organizationId'>>;
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
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerySessionArgs, 'id'>>;
  sessionTerminals?: Resolver<Array<ResolversTypes['Terminal']>, ParentType, ContextType, RequireFields<QuerySessionTerminalsArgs, 'sessionId'>>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerySessionsArgs, 'organizationId'>>;
  threadReplies?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, RequireFields<QueryThreadRepliesArgs, 'rootMessageId'>>;
  threadSummary?: Resolver<Maybe<ResolversTypes['ThreadSummary']>, ParentType, ContextType, RequireFields<QueryThreadSummaryArgs, 'rootMessageId'>>;
  ticket?: Resolver<Maybe<ResolversTypes['Ticket']>, ParentType, ContextType, RequireFields<QueryTicketArgs, 'id'>>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType, RequireFields<QueryTicketsArgs, 'organizationId'>>;
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
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType>;
  childSessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  connection?: Resolver<Maybe<ResolversTypes['SessionConnection']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  endpoints?: Resolver<Maybe<ResolversTypes['SessionEndpoints']>, ParentType, ContextType>;
  hosting?: Resolver<ResolversTypes['HostingMode'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  model?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentSession?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  prUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['SessionStatus'], ParentType, ContextType>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType>;
  tool?: Resolver<ResolversTypes['CodingTool'], ParentType, ContextType>;
  toolSessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  workdir?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  worktreeDeleted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SessionConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SessionConnection'] = ResolversParentTypes['SessionConnection']> = ResolversObject<{
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

export type SubscriptionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = ResolversObject<{
  channelEvents?: SubscriptionResolver<ResolversTypes['Event'], "channelEvents", ParentType, ContextType, RequireFields<SubscriptionChannelEventsArgs, 'channelId' | 'organizationId'>>;
  chatEvents?: SubscriptionResolver<ResolversTypes['Event'], "chatEvents", ParentType, ContextType, RequireFields<SubscriptionChatEventsArgs, 'chatId'>>;
  orgEvents?: SubscriptionResolver<ResolversTypes['Event'], "orgEvents", ParentType, ContextType, RequireFields<SubscriptionOrgEventsArgs, 'organizationId'>>;
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
  AgentIdentity?: AgentIdentityResolvers<ContextType>;
  ApiTokenStatus?: ApiTokenStatusResolvers<ContextType>;
  Channel?: ChannelResolvers<ContextType>;
  ChannelGroup?: ChannelGroupResolvers<ContextType>;
  Chat?: ChatResolvers<ContextType>;
  ChatMember?: ChatMemberResolvers<ContextType>;
  CostBudget?: CostBudgetResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  Event?: EventResolvers<ContextType>;
  InboxItem?: InboxItemResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  Message?: MessageResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Notification?: NotificationResolvers<ContextType>;
  OrgMember?: OrgMemberResolvers<ContextType>;
  Organization?: OrganizationResolvers<ContextType>;
  Participant?: ParticipantResolvers<ContextType>;
  PortEndpoint?: PortEndpointResolvers<ContextType>;
  Project?: ProjectResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Repo?: RepoResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  SessionConnection?: SessionConnectionResolvers<ContextType>;
  SessionEndpoints?: SessionEndpointsResolvers<ContextType>;
  SessionRuntimeInstance?: SessionRuntimeInstanceResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Terminal?: TerminalResolvers<ContextType>;
  TerminalEndpoint?: TerminalEndpointResolvers<ContextType>;
  ThreadSummary?: ThreadSummaryResolvers<ContextType>;
  Ticket?: TicketResolvers<ContextType>;
  TicketLink?: TicketLinkResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
}>;

