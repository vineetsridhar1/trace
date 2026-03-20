/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
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
  JSON: { input: Record<string, unknown>; output: Record<string, unknown>; }
};

export type Actor = {
  __typename?: 'Actor';
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

export type Channel = {
  __typename?: 'Channel';
  id: Scalars['ID']['output'];
  members: Array<User>;
  messages: Array<Event>;
  name: Scalars['String']['output'];
  projects: Array<Project>;
  type: ChannelType;
};


export type ChannelMessagesArgs = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
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
  messages: Array<Event>;
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

export type CreateChannelInput = {
  name: Scalars['String']['input'];
  organizationId: Scalars['ID']['input'];
  projectIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  type?: InputMaybe<ChannelType>;
};

export type CreateChatInput = {
  memberIds: Array<Scalars['ID']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  organizationId: Scalars['ID']['input'];
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
  | 'chat_created'
  | 'chat_member_added'
  | 'chat_member_removed'
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
  | 'session_pr_merged'
  | 'session_pr_opened'
  | 'session_resumed'
  | 'session_started'
  | 'session_terminated'
  | 'ticket_commented'
  | 'ticket_created'
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

export type Mutation = {
  __typename?: 'Mutation';
  addChatMember: Chat;
  commentOnTicket: Event;
  createChannel: Channel;
  createChat: Chat;
  createProject: Project;
  createRepo: Repo;
  createTerminal: Terminal;
  createTicket: Ticket;
  deleteApiToken: Scalars['Boolean']['output'];
  deleteSession: Session;
  destroyTerminal: Scalars['Boolean']['output'];
  dismissInboxItem: InboxItem;
  dismissSession: Session;
  leaveChat: Chat;
  linkEntityToProject: Project;
  linkSessionToTicket: Session;
  moveSessionToRuntime: Session;
  muteScope: Participant;
  pauseSession: Session;
  registerRepoWebhook: Repo;
  resumeSession: Session;
  retrySessionConnection: Session;
  runSession: Session;
  sendChatMessage: Event;
  sendMessage: Event;
  sendSessionMessage: Event;
  setApiToken: ApiTokenStatus;
  startSession: Session;
  subscribe: Participant;
  terminateSession: Session;
  unmuteScope: Participant;
  unregisterRepoWebhook: Repo;
  unsubscribe: Scalars['Boolean']['output'];
  updateRepo: Repo;
  updateSessionConfig: Session;
  updateTicket: Ticket;
};


export type MutationAddChatMemberArgs = {
  input: AddChatMemberInput;
};


export type MutationCommentOnTicketArgs = {
  text: Scalars['String']['input'];
  ticketId: Scalars['ID']['input'];
};


export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
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


export type MutationLeaveChatArgs = {
  chatId: Scalars['ID']['input'];
};


export type MutationLinkEntityToProjectArgs = {
  entityId: Scalars['ID']['input'];
  entityType: EntityType;
  projectId: Scalars['ID']['input'];
};


export type MutationLinkSessionToTicketArgs = {
  sessionId: Scalars['ID']['input'];
  ticketId: Scalars['ID']['input'];
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
  parentId?: InputMaybe<Scalars['ID']['input']>;
  text: Scalars['String']['input'];
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

export type Organization = {
  __typename?: 'Organization';
  channels: Array<Channel>;
  id: Scalars['ID']['output'];
  members: Array<User>;
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
  availableRuntimes: Array<SessionRuntimeInstance>;
  availableSessionRuntimes: Array<SessionRuntimeInstance>;
  channel?: Maybe<Channel>;
  channels: Array<Channel>;
  chat?: Maybe<Chat>;
  chats: Array<Chat>;
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
  myApiTokens: Array<ApiTokenStatus>;
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
  threadReplies: Array<Event>;
  threadSummary?: Maybe<ThreadSummary>;
  ticket?: Maybe<Ticket>;
  tickets: Array<Ticket>;
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


export type QueryChannelsArgs = {
  organizationId: Scalars['ID']['input'];
  projectId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryChatArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChatsArgs = {
  organizationId: Scalars['ID']['input'];
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
  rootEventId: Scalars['ID']['input'];
};


export type QueryThreadSummaryArgs = {
  rootEventId: Scalars['ID']['input'];
};


export type QueryTicketArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTicketsArgs = {
  filters?: InputMaybe<TicketFilters>;
  organizationId: Scalars['ID']['input'];
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
  | 'in_review'
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
  organizationId: Scalars['ID']['input'];
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
  rootEventId: Scalars['ID']['output'];
};

export type Ticket = {
  __typename?: 'Ticket';
  assignees: Array<User>;
  channel?: Maybe<Channel>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  labels: Array<Scalars['String']['output']>;
  origin?: Maybe<Event>;
  priority: Priority;
  projects: Array<Project>;
  sessions: Array<Session>;
  status: TicketStatus;
  title: Scalars['String']['output'];
};

export type TicketFilters = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
};

export type TicketStatus =
  | 'backlog'
  | 'cancelled'
  | 'done'
  | 'in_progress'
  | 'in_review'
  | 'todo';

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
  role: UserRole;
};

export type UserRole =
  | 'admin'
  | 'member'
  | 'observer';

export type ChannelsQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
}>;


export type ChannelsQuery = { __typename?: 'Query', channels: Array<{ __typename?: 'Channel', id: string, name: string, type: ChannelType }> };

export type ReposQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
}>;


export type ReposQuery = { __typename?: 'Query', repos: Array<{ __typename?: 'Repo', id: string, name: string, remoteUrl: string, defaultBranch: string, webhookActive: boolean }> };

export type ChatsQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
}>;


export type ChatsQuery = { __typename?: 'Query', chats: Array<{ __typename?: 'Chat', id: string, type: ChatType, name?: string | null, createdAt: string, updatedAt: string, members: Array<{ __typename?: 'ChatMember', joinedAt: string, user: { __typename?: 'User', id: string, name: string, avatarUrl?: string | null } }> }> };

export type InboxItemsQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
}>;


export type InboxItemsQuery = { __typename?: 'Query', inboxItems: Array<{ __typename?: 'InboxItem', id: string, itemType: InboxItemType, status: InboxItemStatus, title: string, summary?: string | null, payload: Record<string, unknown>, userId: string, sourceType: string, sourceId: string, createdAt: string, resolvedAt?: string | null }> };

export type SessionsQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
  filters?: InputMaybe<SessionFilters>;
}>;


export type SessionsQuery = { __typename?: 'Query', sessions: Array<{ __typename?: 'Session', id: string, name: string, status: SessionStatus, tool: CodingTool, model?: string | null, hosting: HostingMode, prUrl?: string | null, createdAt: string, updatedAt: string, connection?: { __typename?: 'SessionConnection', state: SessionConnectionState, runtimeInstanceId?: string | null, runtimeLabel?: string | null, lastError?: string | null, retryCount: number, canRetry: boolean, canMove: boolean } | null, createdBy: { __typename?: 'User', id: string, name: string, avatarUrl?: string | null }, channel?: { __typename?: 'Channel', id: string } | null, parentSession?: { __typename?: 'Session', id: string, name: string } | null, childSessions: Array<{ __typename?: 'Session', id: string, name: string }> }> };

export type OrgMembersQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type OrgMembersQuery = { __typename?: 'Query', organization?: { __typename?: 'Organization', id: string, members: Array<{ __typename?: 'User', id: string, name: string, email: string, avatarUrl?: string | null }> } | null };

export type AddChatMemberMutationVariables = Exact<{
  input: AddChatMemberInput;
}>;


export type AddChatMemberMutation = { __typename?: 'Mutation', addChatMember: { __typename?: 'Chat', id: string } };

export type SendChatMessageMutationVariables = Exact<{
  chatId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type SendChatMessageMutation = { __typename?: 'Mutation', sendChatMessage: { __typename?: 'Event', id: string } };

export type ThreadRepliesQueryVariables = Exact<{
  rootEventId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ThreadRepliesQuery = { __typename?: 'Query', threadReplies: Array<{ __typename?: 'Event', id: string, scopeType: ScopeType, scopeId: string, eventType: EventType, payload: Record<string, unknown>, parentId?: string | null, timestamp: string, metadata?: Record<string, unknown> | null, actor: { __typename?: 'Actor', type: ActorType, id: string, name?: string | null } }> };

export type SessionDetailQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type SessionDetailQuery = { __typename?: 'Query', session?: { __typename?: 'Session', id: string, name: string, status: SessionStatus, tool: CodingTool, model?: string | null, hosting: HostingMode, branch?: string | null, workdir?: string | null, prUrl?: string | null, createdAt: string, updatedAt: string, repo?: { __typename?: 'Repo', id: string, name: string } | null, connection?: { __typename?: 'SessionConnection', state: SessionConnectionState, runtimeInstanceId?: string | null, runtimeLabel?: string | null, lastError?: string | null, retryCount: number, canRetry: boolean, canMove: boolean } | null, createdBy: { __typename?: 'User', id: string, name: string, avatarUrl?: string | null }, channel?: { __typename?: 'Channel', id: string } | null, parentSession?: { __typename?: 'Session', id: string, name: string, status: SessionStatus } | null, childSessions: Array<{ __typename?: 'Session', id: string, name: string, status: SessionStatus }> } | null };

export type UpdateSessionConfigMutationVariables = Exact<{
  sessionId: Scalars['ID']['input'];
  tool?: InputMaybe<CodingTool>;
  model?: InputMaybe<Scalars['String']['input']>;
}>;


export type UpdateSessionConfigMutation = { __typename?: 'Mutation', updateSessionConfig: { __typename?: 'Session', id: string, tool: CodingTool, model?: string | null } };

export type MyApiTokensQueryVariables = Exact<{ [key: string]: never; }>;


export type MyApiTokensQuery = { __typename?: 'Query', myApiTokens: Array<{ __typename?: 'ApiTokenStatus', provider: ApiTokenProvider, isSet: boolean, updatedAt?: string | null }> };

export type SetApiTokenMutationVariables = Exact<{
  input: SetApiTokenInput;
}>;


export type SetApiTokenMutation = { __typename?: 'Mutation', setApiToken: { __typename?: 'ApiTokenStatus', provider: ApiTokenProvider, isSet: boolean, updatedAt?: string | null } };

export type DeleteApiTokenMutationVariables = Exact<{
  provider: ApiTokenProvider;
}>;


export type DeleteApiTokenMutation = { __typename?: 'Mutation', deleteApiToken: boolean };

export type CreateRepoMutationVariables = Exact<{
  input: CreateRepoInput;
}>;


export type CreateRepoMutation = { __typename?: 'Mutation', createRepo: { __typename?: 'Repo', id: string } };

export type SettingsReposQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
}>;


export type SettingsReposQuery = { __typename?: 'Query', repos: Array<{ __typename?: 'Repo', id: string, name: string, remoteUrl: string, defaultBranch: string, webhookActive: boolean }> };

export type CreateChannelMutationVariables = Exact<{
  input: CreateChannelInput;
}>;


export type CreateChannelMutation = { __typename?: 'Mutation', createChannel: { __typename?: 'Channel', id: string } };

export type CreateChatMutationVariables = Exact<{
  input: CreateChatInput;
}>;


export type CreateChatMutation = { __typename?: 'Mutation', createChat: { __typename?: 'Chat', id: string, type: ChatType, name?: string | null, members: Array<{ __typename?: 'ChatMember', joinedAt: string, user: { __typename?: 'User', id: string, name: string } }> } };

export type ChatEventsQueryQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
  scope?: InputMaybe<ScopeInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
}>;


export type ChatEventsQueryQuery = { __typename?: 'Query', events: Array<{ __typename?: 'Event', id: string, scopeType: ScopeType, scopeId: string, eventType: EventType, payload: Record<string, unknown>, parentId?: string | null, timestamp: string, metadata?: Record<string, unknown> | null, actor: { __typename?: 'Actor', type: ActorType, id: string, name?: string | null } }> };

export type ChatEventsSubscriptionSubscriptionVariables = Exact<{
  chatId: Scalars['ID']['input'];
  organizationId: Scalars['ID']['input'];
}>;


export type ChatEventsSubscriptionSubscription = { __typename?: 'Subscription', chatEvents: { __typename?: 'Event', id: string, scopeType: ScopeType, scopeId: string, eventType: EventType, payload: Record<string, unknown>, parentId?: string | null, timestamp: string, metadata?: Record<string, unknown> | null, actor: { __typename?: 'Actor', type: ActorType, id: string, name?: string | null } } };

export type OrgEventsSubscriptionVariables = Exact<{
  organizationId: Scalars['ID']['input'];
}>;


export type OrgEventsSubscription = { __typename?: 'Subscription', orgEvents: { __typename?: 'Event', id: string, scopeType: ScopeType, scopeId: string, eventType: EventType, payload: Record<string, unknown>, parentId?: string | null, timestamp: string, metadata?: Record<string, unknown> | null, actor: { __typename?: 'Actor', type: ActorType, id: string, name?: string | null } } };

export type SessionEventsQueryVariables = Exact<{
  organizationId: Scalars['ID']['input'];
  scope?: InputMaybe<ScopeInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
}>;


export type SessionEventsQuery = { __typename?: 'Query', events: Array<{ __typename?: 'Event', id: string, scopeType: ScopeType, scopeId: string, eventType: EventType, payload: Record<string, unknown>, parentId?: string | null, timestamp: string, metadata?: Record<string, unknown> | null, actor: { __typename?: 'Actor', type: ActorType, id: string, name?: string | null } }> };

export type StartSessionMutationVariables = Exact<{
  input: StartSessionInput;
}>;


export type StartSessionMutation = { __typename?: 'Mutation', startSession: { __typename?: 'Session', id: string } };

export type RunSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  interactionMode?: InputMaybe<Scalars['String']['input']>;
}>;


export type RunSessionMutation = { __typename?: 'Mutation', runSession: { __typename?: 'Session', id: string } };

export type SendSessionMessageMutationVariables = Exact<{
  sessionId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
  interactionMode?: InputMaybe<Scalars['String']['input']>;
}>;


export type SendSessionMessageMutation = { __typename?: 'Mutation', sendSessionMessage: { __typename?: 'Event', id: string } };

export type TerminateSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type TerminateSessionMutation = { __typename?: 'Mutation', terminateSession: { __typename?: 'Session', id: string } };

export type DismissSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DismissSessionMutation = { __typename?: 'Mutation', dismissSession: { __typename?: 'Session', id: string } };

export type RetrySessionConnectionMutationVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;


export type RetrySessionConnectionMutation = { __typename?: 'Mutation', retrySessionConnection: { __typename?: 'Session', id: string } };

export type MoveSessionToRuntimeMutationVariables = Exact<{
  sessionId: Scalars['ID']['input'];
  runtimeInstanceId: Scalars['ID']['input'];
}>;


export type MoveSessionToRuntimeMutation = { __typename?: 'Mutation', moveSessionToRuntime: { __typename?: 'Session', id: string } };

export type DeleteSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteSessionMutation = { __typename?: 'Mutation', deleteSession: { __typename?: 'Session', id: string } };

export type AvailableSessionRuntimesQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;


export type AvailableSessionRuntimesQuery = { __typename?: 'Query', availableSessionRuntimes: Array<{ __typename?: 'SessionRuntimeInstance', id: string, label: string, hostingMode: HostingMode, supportedTools: Array<CodingTool>, connected: boolean, sessionCount: number, registeredRepoIds: Array<string> }> };

export type DismissInboxItemMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DismissInboxItemMutation = { __typename?: 'Mutation', dismissInboxItem: { __typename?: 'InboxItem', id: string } };

export type AvailableRuntimesQueryVariables = Exact<{
  tool: CodingTool;
}>;


export type AvailableRuntimesQuery = { __typename?: 'Query', availableRuntimes: Array<{ __typename?: 'SessionRuntimeInstance', id: string, label: string, hostingMode: HostingMode, supportedTools: Array<CodingTool>, connected: boolean, sessionCount: number, registeredRepoIds: Array<string> }> };

export type UpdateRepoMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateRepoInput;
}>;


export type UpdateRepoMutation = { __typename?: 'Mutation', updateRepo: { __typename?: 'Repo', id: string } };

export type RegisterRepoWebhookMutationVariables = Exact<{
  repoId: Scalars['ID']['input'];
}>;


export type RegisterRepoWebhookMutation = { __typename?: 'Mutation', registerRepoWebhook: { __typename?: 'Repo', id: string } };

export type UnregisterRepoWebhookMutationVariables = Exact<{
  repoId: Scalars['ID']['input'];
}>;


export type UnregisterRepoWebhookMutation = { __typename?: 'Mutation', unregisterRepoWebhook: { __typename?: 'Repo', id: string } };

export type RepoBranchesQueryVariables = Exact<{
  repoId: Scalars['ID']['input'];
  runtimeInstanceId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type RepoBranchesQuery = { __typename?: 'Query', repoBranches: Array<string> };

export type SessionTerminalsQueryVariables = Exact<{
  sessionId: Scalars['ID']['input'];
}>;


export type SessionTerminalsQuery = { __typename?: 'Query', sessionTerminals: Array<{ __typename?: 'Terminal', id: string, sessionId: string }> };

export type CreateTerminalMutationVariables = Exact<{
  sessionId: Scalars['ID']['input'];
  cols: Scalars['Int']['input'];
  rows: Scalars['Int']['input'];
}>;


export type CreateTerminalMutation = { __typename?: 'Mutation', createTerminal: { __typename?: 'Terminal', id: string, sessionId: string } };

export type DestroyTerminalMutationVariables = Exact<{
  terminalId: Scalars['ID']['input'];
}>;


export type DestroyTerminalMutation = { __typename?: 'Mutation', destroyTerminal: boolean };


export const ChannelsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Channels"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channels"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}}]}}]} as unknown as DocumentNode<ChannelsQuery, ChannelsQueryVariables>;
export const ReposDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Repos"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"repos"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"remoteUrl"}},{"kind":"Field","name":{"kind":"Name","value":"defaultBranch"}},{"kind":"Field","name":{"kind":"Name","value":"webhookActive"}}]}}]}}]} as unknown as DocumentNode<ReposQuery, ReposQueryVariables>;
export const ChatsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Chats"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chats"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"joinedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<ChatsQuery, ChatsQueryVariables>;
export const InboxItemsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"InboxItems"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"inboxItems"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"itemType"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"summary"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"sourceType"}},{"kind":"Field","name":{"kind":"Name","value":"sourceId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<InboxItemsQuery, InboxItemsQueryVariables>;
export const SessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Sessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SessionFilters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"tool"}},{"kind":"Field","name":{"kind":"Name","value":"model"}},{"kind":"Field","name":{"kind":"Name","value":"hosting"}},{"kind":"Field","name":{"kind":"Name","value":"prUrl"}},{"kind":"Field","name":{"kind":"Name","value":"connection"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"runtimeInstanceId"}},{"kind":"Field","name":{"kind":"Name","value":"runtimeLabel"}},{"kind":"Field","name":{"kind":"Name","value":"lastError"}},{"kind":"Field","name":{"kind":"Name","value":"retryCount"}},{"kind":"Field","name":{"kind":"Name","value":"canRetry"}},{"kind":"Field","name":{"kind":"Name","value":"canMove"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"channel"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentSession"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"childSessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SessionsQuery, SessionsQueryVariables>;
export const OrgMembersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrgMembers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organization"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]} as unknown as DocumentNode<OrgMembersQuery, OrgMembersQueryVariables>;
export const AddChatMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddChatMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"AddChatMemberInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addChatMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddChatMemberMutation, AddChatMemberMutationVariables>;
export const SendChatMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendChatMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"chatId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"parentId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendChatMessage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"chatId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"chatId"}}},{"kind":"Argument","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}},{"kind":"Argument","name":{"kind":"Name","value":"parentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"parentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<SendChatMessageMutation, SendChatMessageMutationVariables>;
export const ThreadRepliesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ThreadReplies"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"rootEventId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadReplies"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"rootEventId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"rootEventId"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"scopeType"}},{"kind":"Field","name":{"kind":"Name","value":"scopeId"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}}]}}]}}]} as unknown as DocumentNode<ThreadRepliesQuery, ThreadRepliesQueryVariables>;
export const SessionDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SessionDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"session"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"tool"}},{"kind":"Field","name":{"kind":"Name","value":"model"}},{"kind":"Field","name":{"kind":"Name","value":"hosting"}},{"kind":"Field","name":{"kind":"Name","value":"repo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"branch"}},{"kind":"Field","name":{"kind":"Name","value":"workdir"}},{"kind":"Field","name":{"kind":"Name","value":"prUrl"}},{"kind":"Field","name":{"kind":"Name","value":"connection"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"runtimeInstanceId"}},{"kind":"Field","name":{"kind":"Name","value":"runtimeLabel"}},{"kind":"Field","name":{"kind":"Name","value":"lastError"}},{"kind":"Field","name":{"kind":"Name","value":"retryCount"}},{"kind":"Field","name":{"kind":"Name","value":"canRetry"}},{"kind":"Field","name":{"kind":"Name","value":"canMove"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"channel"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentSession"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}},{"kind":"Field","name":{"kind":"Name","value":"childSessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SessionDetailQuery, SessionDetailQueryVariables>;
export const UpdateSessionConfigDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateSessionConfig"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tool"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CodingTool"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"model"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateSessionConfig"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}},{"kind":"Argument","name":{"kind":"Name","value":"tool"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tool"}}},{"kind":"Argument","name":{"kind":"Name","value":"model"},"value":{"kind":"Variable","name":{"kind":"Name","value":"model"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"tool"}},{"kind":"Field","name":{"kind":"Name","value":"model"}}]}}]}}]} as unknown as DocumentNode<UpdateSessionConfigMutation, UpdateSessionConfigMutationVariables>;
export const MyApiTokensDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyApiTokens"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myApiTokens"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"isSet"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<MyApiTokensQuery, MyApiTokensQueryVariables>;
export const SetApiTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetApiToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetApiTokenInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setApiToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"isSet"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetApiTokenMutation, SetApiTokenMutationVariables>;
export const DeleteApiTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteApiToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"provider"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ApiTokenProvider"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteApiToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"provider"},"value":{"kind":"Variable","name":{"kind":"Name","value":"provider"}}}]}]}}]} as unknown as DocumentNode<DeleteApiTokenMutation, DeleteApiTokenMutationVariables>;
export const CreateRepoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateRepo"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateRepoInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createRepo"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreateRepoMutation, CreateRepoMutationVariables>;
export const SettingsReposDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SettingsRepos"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"repos"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"remoteUrl"}},{"kind":"Field","name":{"kind":"Name","value":"defaultBranch"}},{"kind":"Field","name":{"kind":"Name","value":"webhookActive"}}]}}]}}]} as unknown as DocumentNode<SettingsReposQuery, SettingsReposQueryVariables>;
export const CreateChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateChannelInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreateChannelMutation, CreateChannelMutationVariables>;
export const CreateChatDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateChat"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateChatInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createChat"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"joinedAt"}}]}}]}}]}}]} as unknown as DocumentNode<CreateChatMutation, CreateChatMutationVariables>;
export const ChatEventsQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ChatEventsQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"scope"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ScopeInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"before"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"events"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"scope"},"value":{"kind":"Variable","name":{"kind":"Name","value":"scope"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"before"},"value":{"kind":"Variable","name":{"kind":"Name","value":"before"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"scopeType"}},{"kind":"Field","name":{"kind":"Name","value":"scopeId"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}}]}}]}}]} as unknown as DocumentNode<ChatEventsQueryQuery, ChatEventsQueryQueryVariables>;
export const ChatEventsSubscriptionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"ChatEventsSubscription"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"chatId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chatEvents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"chatId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"chatId"}}},{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"scopeType"}},{"kind":"Field","name":{"kind":"Name","value":"scopeId"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}}]}}]}}]} as unknown as DocumentNode<ChatEventsSubscriptionSubscription, ChatEventsSubscriptionSubscriptionVariables>;
export const OrgEventsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"OrgEvents"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgEvents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"scopeType"}},{"kind":"Field","name":{"kind":"Name","value":"scopeId"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}}]}}]}}]} as unknown as DocumentNode<OrgEventsSubscription, OrgEventsSubscriptionVariables>;
export const SessionEventsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SessionEvents"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"scope"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ScopeInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"before"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"events"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"organizationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"organizationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"scope"},"value":{"kind":"Variable","name":{"kind":"Name","value":"scope"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"before"},"value":{"kind":"Variable","name":{"kind":"Name","value":"before"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"scopeType"}},{"kind":"Field","name":{"kind":"Name","value":"scopeId"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}}]}}]}}]} as unknown as DocumentNode<SessionEventsQuery, SessionEventsQueryVariables>;
export const StartSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"StartSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"StartSessionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"startSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<StartSessionMutation, StartSessionMutationVariables>;
export const RunSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RunSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"prompt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"interactionMode"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"runSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"prompt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"prompt"}}},{"kind":"Argument","name":{"kind":"Name","value":"interactionMode"},"value":{"kind":"Variable","name":{"kind":"Name","value":"interactionMode"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<RunSessionMutation, RunSessionMutationVariables>;
export const SendSessionMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendSessionMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"interactionMode"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendSessionMessage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}},{"kind":"Argument","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}},{"kind":"Argument","name":{"kind":"Name","value":"interactionMode"},"value":{"kind":"Variable","name":{"kind":"Name","value":"interactionMode"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<SendSessionMessageMutation, SendSessionMessageMutationVariables>;
export const TerminateSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"TerminateSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"terminateSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<TerminateSessionMutation, TerminateSessionMutationVariables>;
export const DismissSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DismissSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dismissSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DismissSessionMutation, DismissSessionMutationVariables>;
export const RetrySessionConnectionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RetrySessionConnection"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"retrySessionConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<RetrySessionConnectionMutation, RetrySessionConnectionMutationVariables>;
export const MoveSessionToRuntimeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"MoveSessionToRuntime"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"runtimeInstanceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"moveSessionToRuntime"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}},{"kind":"Argument","name":{"kind":"Name","value":"runtimeInstanceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"runtimeInstanceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<MoveSessionToRuntimeMutation, MoveSessionToRuntimeMutationVariables>;
export const DeleteSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DeleteSessionMutation, DeleteSessionMutationVariables>;
export const AvailableSessionRuntimesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AvailableSessionRuntimes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"availableSessionRuntimes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"hostingMode"}},{"kind":"Field","name":{"kind":"Name","value":"supportedTools"}},{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"sessionCount"}},{"kind":"Field","name":{"kind":"Name","value":"registeredRepoIds"}}]}}]}}]} as unknown as DocumentNode<AvailableSessionRuntimesQuery, AvailableSessionRuntimesQueryVariables>;
export const DismissInboxItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DismissInboxItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"dismissInboxItem"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DismissInboxItemMutation, DismissInboxItemMutationVariables>;
export const AvailableRuntimesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AvailableRuntimes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tool"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CodingTool"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"availableRuntimes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"tool"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tool"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"hostingMode"}},{"kind":"Field","name":{"kind":"Name","value":"supportedTools"}},{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"sessionCount"}},{"kind":"Field","name":{"kind":"Name","value":"registeredRepoIds"}}]}}]}}]} as unknown as DocumentNode<AvailableRuntimesQuery, AvailableRuntimesQueryVariables>;
export const UpdateRepoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateRepo"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateRepoInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateRepo"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateRepoMutation, UpdateRepoMutationVariables>;
export const RegisterRepoWebhookDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RegisterRepoWebhook"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"repoId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"registerRepoWebhook"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"repoId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"repoId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<RegisterRepoWebhookMutation, RegisterRepoWebhookMutationVariables>;
export const UnregisterRepoWebhookDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UnregisterRepoWebhook"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"repoId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"unregisterRepoWebhook"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"repoId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"repoId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UnregisterRepoWebhookMutation, UnregisterRepoWebhookMutationVariables>;
export const RepoBranchesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RepoBranches"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"repoId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"runtimeInstanceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"repoBranches"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"repoId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"repoId"}}},{"kind":"Argument","name":{"kind":"Name","value":"runtimeInstanceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"runtimeInstanceId"}}}]}]}}]} as unknown as DocumentNode<RepoBranchesQuery, RepoBranchesQueryVariables>;
export const SessionTerminalsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SessionTerminals"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionTerminals"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}}]}}]}}]} as unknown as DocumentNode<SessionTerminalsQuery, SessionTerminalsQueryVariables>;
export const CreateTerminalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTerminal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cols"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"rows"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTerminal"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}},{"kind":"Argument","name":{"kind":"Name","value":"cols"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cols"}}},{"kind":"Argument","name":{"kind":"Name","value":"rows"},"value":{"kind":"Variable","name":{"kind":"Name","value":"rows"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}}]}}]}}]} as unknown as DocumentNode<CreateTerminalMutation, CreateTerminalMutationVariables>;
export const DestroyTerminalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DestroyTerminal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"terminalId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"destroyTerminal"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"terminalId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"terminalId"}}}]}]}}]} as unknown as DocumentNode<DestroyTerminalMutation, DestroyTerminalMutationVariables>;