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

export type AgentTrustLevel =
  | 'autonomous'
  | 'blocked'
  | 'suggest';

export type ApiTokenProvider =
  | 'anthropic'
  | 'github'
  | 'openai';

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
  commentOnTicket: Event;
  createChannel: Channel;
  createProject: Project;
  createRepo: Repo;
  createTicket: Ticket;
  deleteApiToken: Scalars['Boolean']['output'];
  deleteSession: Session;
  dismissInboxItem: InboxItem;
  linkEntityToProject: Project;
  linkSessionToTicket: Session;
  moveSessionToRuntime: Session;
  pauseSession: Session;
  resumeSession: Session;
  retrySessionConnection: Session;
  runSession: Session;
  sendMessage: Event;
  sendSessionMessage: Event;
  setApiToken: ApiTokenStatus;
  startSession: Session;
  terminateSession: Session;
  updateRepo: Repo;
  updateSessionConfig: Session;
  updateTicket: Ticket;
};


export type MutationCommentOnTicketArgs = {
  text: Scalars['String']['input'];
  ticketId: Scalars['ID']['input'];
};


export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};


export type MutationCreateProjectArgs = {
  input: CreateProjectInput;
};


export type MutationCreateRepoArgs = {
  input: CreateRepoInput;
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


export type MutationDismissInboxItemArgs = {
  id: Scalars['ID']['input'];
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


export type MutationPauseSessionArgs = {
  id: Scalars['ID']['input'];
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


export type MutationTerminateSessionArgs = {
  id: Scalars['ID']['input'];
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
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
  myApiTokens: Array<ApiTokenStatus>;
  mySessions: Array<Session>;
  organization?: Maybe<Organization>;
  project?: Maybe<Project>;
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  repoBranches: Array<Scalars['String']['output']>;
  repos: Array<Repo>;
  session?: Maybe<Session>;
  sessions: Array<Session>;
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
  runtimeInstanceId: Scalars['ID']['input'];
};


export type QueryReposArgs = {
  organizationId: Scalars['ID']['input'];
};


export type QuerySessionArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySessionsArgs = {
  filters?: InputMaybe<SessionFilters>;
  organizationId: Scalars['ID']['input'];
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
};

export type ScopeInput = {
  id: Scalars['ID']['input'];
  type: ScopeType;
};

export type ScopeType =
  | 'channel'
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

export type TerminalEndpoint = {
  __typename?: 'TerminalEndpoint';
  id: Scalars['String']['output'];
  status: Scalars['String']['output'];
  wsUrl: Scalars['String']['output'];
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
