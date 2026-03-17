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
  AgentTrustLevel: AgentTrustLevel;
  ApiTokenProvider: ApiTokenProvider;
  ApiTokenStatus: ResolverTypeWrapper<ApiTokenStatus>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Channel: ResolverTypeWrapper<Channel>;
  ChannelType: ChannelType;
  CodingTool: CodingTool;
  CreateChannelInput: CreateChannelInput;
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
  Mutation: ResolverTypeWrapper<{}>;
  Notification: ResolverTypeWrapper<Notification>;
  Organization: ResolverTypeWrapper<Organization>;
  PortEndpoint: ResolverTypeWrapper<PortEndpoint>;
  Priority: Priority;
  Project: ResolverTypeWrapper<Project>;
  Query: ResolverTypeWrapper<{}>;
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
  TerminalEndpoint: ResolverTypeWrapper<TerminalEndpoint>;
  Ticket: ResolverTypeWrapper<Ticket>;
  TicketFilters: TicketFilters;
  TicketStatus: TicketStatus;
  UpdateRepoInput: UpdateRepoInput;
  UpdateTicketInput: UpdateTicketInput;
  User: ResolverTypeWrapper<User>;
  UserRole: UserRole;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Actor: Actor;
  ApiTokenStatus: ApiTokenStatus;
  Boolean: Scalars['Boolean']['output'];
  Channel: Channel;
  CreateChannelInput: CreateChannelInput;
  CreateProjectInput: CreateProjectInput;
  CreateRepoInput: CreateRepoInput;
  CreateTicketInput: CreateTicketInput;
  DateTime: Scalars['DateTime']['output'];
  Event: Event;
  ID: Scalars['ID']['output'];
  InboxItem: InboxItem;
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: {};
  Notification: Notification;
  Organization: Organization;
  PortEndpoint: PortEndpoint;
  Project: Project;
  Query: {};
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
  TerminalEndpoint: TerminalEndpoint;
  Ticket: Ticket;
  TicketFilters: TicketFilters;
  UpdateRepoInput: UpdateRepoInput;
  UpdateTicketInput: UpdateTicketInput;
  User: User;
}>;

export type ActorResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Actor'] = ResolversParentTypes['Actor']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['ActorType'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ApiTokenStatusResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ApiTokenStatus'] = ResolversParentTypes['ApiTokenStatus']> = ResolversObject<{
  isSet?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  provider?: Resolver<ResolversTypes['ApiTokenProvider'], ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ChannelResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Channel'] = ResolversParentTypes['Channel']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, Partial<ChannelMessagesArgs>>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['ChannelType'], ParentType, ContextType>;
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

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  commentOnTicket?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationCommentOnTicketArgs, 'text' | 'ticketId'>>;
  createChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationCreateChannelArgs, 'input'>>;
  createProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationCreateProjectArgs, 'input'>>;
  createRepo?: Resolver<ResolversTypes['Repo'], ParentType, ContextType, RequireFields<MutationCreateRepoArgs, 'input'>>;
  createTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationCreateTicketArgs, 'input'>>;
  deleteApiToken?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteApiTokenArgs, 'provider'>>;
  deleteSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationDeleteSessionArgs, 'id'>>;
  dismissInboxItem?: Resolver<ResolversTypes['InboxItem'], ParentType, ContextType, RequireFields<MutationDismissInboxItemArgs, 'id'>>;
  linkEntityToProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationLinkEntityToProjectArgs, 'entityId' | 'entityType' | 'projectId'>>;
  linkSessionToTicket?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationLinkSessionToTicketArgs, 'sessionId' | 'ticketId'>>;
  moveSessionToRuntime?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationMoveSessionToRuntimeArgs, 'runtimeInstanceId' | 'sessionId'>>;
  pauseSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationPauseSessionArgs, 'id'>>;
  resumeSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationResumeSessionArgs, 'id'>>;
  retrySessionConnection?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationRetrySessionConnectionArgs, 'sessionId'>>;
  runSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationRunSessionArgs, 'id'>>;
  sendMessage?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationSendMessageArgs, 'channelId' | 'text'>>;
  sendSessionMessage?: Resolver<ResolversTypes['Event'], ParentType, ContextType, RequireFields<MutationSendSessionMessageArgs, 'sessionId' | 'text'>>;
  setApiToken?: Resolver<ResolversTypes['ApiTokenStatus'], ParentType, ContextType, RequireFields<MutationSetApiTokenArgs, 'input'>>;
  startSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationStartSessionArgs, 'input'>>;
  terminateSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationTerminateSessionArgs, 'id'>>;
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

export type OrganizationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Organization'] = ResolversParentTypes['Organization']> = ResolversObject<{
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  repos?: Resolver<Array<ResolversTypes['Repo']>, ParentType, ContextType>;
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
  availableRuntimes?: Resolver<Array<ResolversTypes['SessionRuntimeInstance']>, ParentType, ContextType, RequireFields<QueryAvailableRuntimesArgs, 'tool'>>;
  availableSessionRuntimes?: Resolver<Array<ResolversTypes['SessionRuntimeInstance']>, ParentType, ContextType, RequireFields<QueryAvailableSessionRuntimesArgs, 'sessionId'>>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QueryChannelArgs, 'id'>>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QueryChannelsArgs, 'organizationId'>>;
  events?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryEventsArgs, 'organizationId'>>;
  inboxItems?: Resolver<Array<ResolversTypes['InboxItem']>, ParentType, ContextType, RequireFields<QueryInboxItemsArgs, 'organizationId'>>;
  myApiTokens?: Resolver<Array<ResolversTypes['ApiTokenStatus']>, ParentType, ContextType>;
  mySessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QueryMySessionsArgs, 'organizationId'>>;
  organization?: Resolver<Maybe<ResolversTypes['Organization']>, ParentType, ContextType, RequireFields<QueryOrganizationArgs, 'id'>>;
  project?: Resolver<Maybe<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectArgs, 'id'>>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectsArgs, 'organizationId'>>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType, RequireFields<QueryRepoArgs, 'id'>>;
  repoBranches?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QueryRepoBranchesArgs, 'repoId' | 'runtimeInstanceId'>>;
  repos?: Resolver<Array<ResolversTypes['Repo']>, ParentType, ContextType, RequireFields<QueryReposArgs, 'organizationId'>>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerySessionArgs, 'id'>>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerySessionsArgs, 'organizationId'>>;
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
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  repo?: Resolver<Maybe<ResolversTypes['Repo']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['SessionStatus'], ParentType, ContextType>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType>;
  tool?: Resolver<ResolversTypes['CodingTool'], ParentType, ContextType>;
  toolSessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  workdir?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
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
  orgEvents?: SubscriptionResolver<ResolversTypes['Event'], "orgEvents", ParentType, ContextType, RequireFields<SubscriptionOrgEventsArgs, 'organizationId'>>;
  sessionPortsChanged?: SubscriptionResolver<ResolversTypes['SessionEndpoints'], "sessionPortsChanged", ParentType, ContextType, RequireFields<SubscriptionSessionPortsChangedArgs, 'organizationId' | 'sessionId'>>;
  sessionStatusChanged?: SubscriptionResolver<ResolversTypes['Session'], "sessionStatusChanged", ParentType, ContextType, RequireFields<SubscriptionSessionStatusChangedArgs, 'organizationId' | 'sessionId'>>;
  ticketEvents?: SubscriptionResolver<ResolversTypes['Event'], "ticketEvents", ParentType, ContextType, RequireFields<SubscriptionTicketEventsArgs, 'organizationId' | 'ticketId'>>;
  userNotifications?: SubscriptionResolver<ResolversTypes['Notification'], "userNotifications", ParentType, ContextType, RequireFields<SubscriptionUserNotificationsArgs, 'organizationId'>>;
}>;

export type TerminalEndpointResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TerminalEndpoint'] = ResolversParentTypes['TerminalEndpoint']> = ResolversObject<{
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  wsUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TicketResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Ticket'] = ResolversParentTypes['Ticket']> = ResolversObject<{
  assignees?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  labels?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  origin?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Priority'], ParentType, ContextType>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['TicketStatus'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['UserRole'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = Context> = ResolversObject<{
  Actor?: ActorResolvers<ContextType>;
  ApiTokenStatus?: ApiTokenStatusResolvers<ContextType>;
  Channel?: ChannelResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  Event?: EventResolvers<ContextType>;
  InboxItem?: InboxItemResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  Notification?: NotificationResolvers<ContextType>;
  Organization?: OrganizationResolvers<ContextType>;
  PortEndpoint?: PortEndpointResolvers<ContextType>;
  Project?: ProjectResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Repo?: RepoResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  SessionConnection?: SessionConnectionResolvers<ContextType>;
  SessionEndpoints?: SessionEndpointsResolvers<ContextType>;
  SessionRuntimeInstance?: SessionRuntimeInstanceResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  TerminalEndpoint?: TerminalEndpointResolvers<ContextType>;
  Ticket?: TicketResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
}>;

