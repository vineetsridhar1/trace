import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { AiChatMapper, AiChatMessageMapper, AiChatMessageConnectionMapper, AiChatStreamPayloadMapper } from './aiChat/schema.mappers';
import { AttachmentMapper } from './attachment/schema.mappers';
import { AuthUserMapper } from './auth/schema.mappers';
import { ChannelMapper, ChannelChangeEventMapper } from './channel/schema.mappers';
import { ChannelMessageMapper, ChannelMessageAuthorMapper, ChannelMessageConnectionMapper } from './channelMessage/schema.mappers';
import { CliSessionMapper, CliSessionConnectionMapper } from './cli-session/schema.mappers';
import { CreateWorkspacePayloadMapper, PRStatusMapper, PresencePayloadMapper, PresenceUserMapper, WorkspaceMapper, WorkspaceCliSessionMapper, WorkspaceConnectionMapper, WorkspaceDeletedPayloadMapper, WorkspacePresenceMapper, WorkspaceUserMapper } from './workspace/schema.mappers';
import { EventMapper, EventConnectionMapper, SessionEventPayloadMapper } from './event/schema.mappers';
import { ImportedTicketResultMapper, KanbanColumnMapper, TicketMapper, TicketAttachmentMapper, TicketUpsertPayloadMapper, TicketWorkspaceMapper } from './kanban/schema.mappers';
import { ServerMapper } from './server/schema.mappers';
import { SessionMapper } from './session/schema.mappers';
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
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
  DateTime: { input: string; output: Date; }
  JSON: { input: any; output: any; }
};

export type AiChat = {
  __typename?: 'AiChat';
  channelId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  lastMessage?: Maybe<Scalars['String']['output']>;
  serverId: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AiChatMessage = {
  __typename?: 'AiChatMessage';
  chatId: Scalars['String']['output'];
  content: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  role: Scalars['String']['output'];
};

export type AiChatMessageConnection = {
  __typename?: 'AiChatMessageConnection';
  limit: Scalars['Int']['output'];
  messages: Array<AiChatMessage>;
  offset: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type AiChatStreamPayload = {
  __typename?: 'AiChatStreamPayload';
  chatId: Scalars['String']['output'];
  content?: Maybe<Scalars['String']['output']>;
  delta?: Maybe<Scalars['String']['output']>;
  error?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
};

export type Attachment = {
  __typename?: 'Attachment';
  byteSize: Scalars['Int']['output'];
  contentType: Scalars['String']['output'];
  filename: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  localPath: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type AuthUser = {
  __typename?: 'AuthUser';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  githubUsername?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  role: Scalars['String']['output'];
};

export type Channel = {
  __typename?: 'Channel';
  baseBranch?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  defaultRepoPath?: Maybe<Scalars['String']['output']>;
  defaultRunScript?: Maybe<Scalars['String']['output']>;
  defaultSetupScript?: Maybe<Scalars['String']['output']>;
  githubUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  serverId: Scalars['String']['output'];
  teamIds: Array<Scalars['String']['output']>;
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  workspacesEnabled: Scalars['Boolean']['output'];
};

export type ChannelChangeEvent = {
  __typename?: 'ChannelChangeEvent';
  action: Scalars['String']['output'];
  channelId: Scalars['String']['output'];
};

export type ChannelMessage = {
  __typename?: 'ChannelMessage';
  author: ChannelMessageAuthor;
  channelId: Scalars['String']['output'];
  content: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
};

export type ChannelMessageAuthor = {
  __typename?: 'ChannelMessageAuthor';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type ChannelMessageConnection = {
  __typename?: 'ChannelMessageConnection';
  limit: Scalars['Int']['output'];
  messages: Array<ChannelMessage>;
  offset: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type CliSession = {
  __typename?: 'CliSession';
  cwd?: Maybe<Scalars['String']['output']>;
  eventCount: Scalars['Int']['output'];
  firstSeenAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  lastSeenAt: Scalars['DateTime']['output'];
  permissionMode?: Maybe<Scalars['String']['output']>;
  sessionId: Scalars['String']['output'];
  status: Scalars['String']['output'];
  toolSummary?: Maybe<Scalars['JSON']['output']>;
  transcriptPath?: Maybe<Scalars['String']['output']>;
};

export type CliSessionConnection = {
  __typename?: 'CliSessionConnection';
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  sessions: Array<CliSession>;
  total: Scalars['Int']['output'];
};

export type CreateWorkspacePayload = {
  __typename?: 'CreateWorkspacePayload';
  event?: Maybe<Event>;
  session: Session;
  workspace: Workspace;
};

export type Event = {
  __typename?: 'Event';
  cliSessionId: Scalars['String']['output'];
  hookEventName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  importance: Scalars['String']['output'];
  lastAssistantMessage?: Maybe<Scalars['String']['output']>;
  rawPayload: Scalars['JSON']['output'];
  sessionId: Scalars['String']['output'];
  stopHookActive?: Maybe<Scalars['Boolean']['output']>;
  timestamp: Scalars['DateTime']['output'];
  toolInput?: Maybe<Scalars['JSON']['output']>;
  toolName?: Maybe<Scalars['String']['output']>;
  toolResponse?: Maybe<Scalars['JSON']['output']>;
  toolUseId?: Maybe<Scalars['String']['output']>;
};

export type EventConnection = {
  __typename?: 'EventConnection';
  cliCostUsd?: Maybe<Scalars['Float']['output']>;
  events: Array<Event>;
  latestContextTokens?: Maybe<Scalars['Int']['output']>;
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  tokenUsage?: Maybe<TokenUsage>;
  total: Scalars['Int']['output'];
};

export type ImportTicketInput = {
  body: Scalars['String']['input'];
  dependencies: Array<Scalars['String']['input']>;
  ticketJsonId: Scalars['String']['input'];
  title: Scalars['String']['input'];
};

export type ImportedTicketResult = {
  __typename?: 'ImportedTicketResult';
  ticketId: Scalars['ID']['output'];
  ticketJsonId: Scalars['String']['output'];
  workspaceId: Scalars['ID']['output'];
};

export type KanbanColumn = {
  __typename?: 'KanbanColumn';
  channelId: Scalars['String']['output'];
  color?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  sortOrder: Scalars['Int']['output'];
  tickets: Array<Ticket>;
};

export type Mutation = {
  __typename?: 'Mutation';
  appendPrompt: CreateWorkspacePayload;
  createAiChat: AiChat;
  createChannel: Channel;
  createColumn: KanbanColumn;
  createServer: Server;
  createSession: Session;
  createWorkspace: CreateWorkspacePayload;
  deleteAiChat: Scalars['Boolean']['output'];
  deleteChannel: Scalars['Boolean']['output'];
  deleteColumn: Scalars['Boolean']['output'];
  deleteWorkspace: Scalars['Boolean']['output'];
  handoffWorkspace: Workspace;
  importTicketsToProject: Array<ImportedTicketResult>;
  moveTicket: Ticket;
  removeTicketDependency: Scalars['Boolean']['output'];
  renameAiChat: AiChat;
  reportPresence: Scalars['Boolean']['output'];
  sendAiChatMessage: AiChatMessage;
  sendChannelMessage: ChannelMessage;
  setTicketDependencies: Workspace;
  setWorkspacePrUrl: Scalars['Boolean']['output'];
  updateChannel: Channel;
  updateColumn: KanbanColumn;
  updateInitialPrompt: CreateWorkspacePayload;
  updateQueuedRunConfig: Scalars['Boolean']['output'];
  updateWorkspacePreview: Workspace;
  updateWorkspaceStatus: Workspace;
  uploadAttachment: Attachment;
};


export type MutationappendPromptArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  createNewSession?: InputMaybe<Scalars['Boolean']['input']>;
  sessionId?: InputMaybe<Scalars['ID']['input']>;
  text: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationcreateAiChatArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  serverId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationcreateChannelArgs = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  defaultRunScript?: InputMaybe<Scalars['String']['input']>;
  defaultSetupScript?: InputMaybe<Scalars['String']['input']>;
  githubUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  serverId?: InputMaybe<Scalars['String']['input']>;
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  type?: InputMaybe<Scalars['String']['input']>;
  workspacesEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationcreateColumnArgs = {
  channelId: Scalars['ID']['input'];
  color?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};


export type MutationcreateServerArgs = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};


export type MutationcreateSessionArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationcreateWorkspaceArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  isProductDoc?: InputMaybe<Scalars['Boolean']['input']>;
  text: Scalars['String']['input'];
  ticketId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationdeleteAiChatArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteChannelArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteColumnArgs = {
  columnId: Scalars['ID']['input'];
};


export type MutationdeleteWorkspaceArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationhandoffWorkspaceArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationimportTicketsToProjectArgs = {
  channelId: Scalars['ID']['input'];
  runConfig: Scalars['JSON']['input'];
  tickets: Array<ImportTicketInput>;
};


export type MutationmoveTicketArgs = {
  columnId: Scalars['ID']['input'];
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
  ticketId: Scalars['ID']['input'];
};


export type MutationremoveTicketDependencyArgs = {
  channelId: Scalars['ID']['input'];
  dependsOnWorkspaceId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationrenameAiChatArgs = {
  id: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationreportPresenceArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationsendAiChatMessageArgs = {
  chatId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationsendChannelMessageArgs = {
  channelId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationsetTicketDependenciesArgs = {
  channelId: Scalars['ID']['input'];
  dependsOnWorkspaceIds: Array<Scalars['ID']['input']>;
  runConfig: Scalars['JSON']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationsetWorkspacePrUrlArgs = {
  channelId: Scalars['ID']['input'];
  prUrl: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationupdateChannelArgs = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  defaultRepoPath?: InputMaybe<Scalars['String']['input']>;
  defaultRunScript?: InputMaybe<Scalars['String']['input']>;
  defaultSetupScript?: InputMaybe<Scalars['String']['input']>;
  githubUrl?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  teamIds?: InputMaybe<Array<Scalars['String']['input']>>;
  workspacesEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationupdateColumnArgs = {
  color?: InputMaybe<Scalars['String']['input']>;
  columnId: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationupdateInitialPromptArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationupdateQueuedRunConfigArgs = {
  runConfig: Scalars['JSON']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationupdateWorkspacePreviewArgs = {
  channelId: Scalars['ID']['input'];
  preview: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationupdateWorkspaceStatusArgs = {
  channelId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationuploadAttachmentArgs = {
  contentType: Scalars['String']['input'];
  data: Scalars['String']['input'];
  filename: Scalars['String']['input'];
};

export type PRStatus = {
  __typename?: 'PRStatus';
  branch: Scalars['String']['output'];
  hasPR: Scalars['Boolean']['output'];
  merged: Scalars['Boolean']['output'];
  prUrl?: Maybe<Scalars['String']['output']>;
};

export type PresencePayload = {
  __typename?: 'PresencePayload';
  channelId: Scalars['String']['output'];
  presence: Array<WorkspacePresence>;
};

export type PresenceUser = {
  __typename?: 'PresenceUser';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  userId: Scalars['ID']['output'];
};

export type Query = {
  __typename?: 'Query';
  aiChatMessages: AiChatMessageConnection;
  aiChats: Array<AiChat>;
  board: Array<KanbanColumn>;
  channel?: Maybe<Channel>;
  channelMessages: ChannelMessageConnection;
  channelPresence: Array<WorkspacePresence>;
  channels: Array<Channel>;
  checkPRStatuses: Array<PRStatus>;
  event?: Maybe<Event>;
  generateBranchName?: Maybe<Scalars['String']['output']>;
  me?: Maybe<AuthUser>;
  servers: Array<Server>;
  sessionEvents: EventConnection;
  sessions: Array<Session>;
  ticketByWorkspaceId?: Maybe<Ticket>;
  ticketDependencies: Array<TicketDependency>;
  workspace?: Maybe<Workspace>;
  workspaceEvents: EventConnection;
  workspaces: WorkspaceConnection;
};


export type QueryaiChatMessagesArgs = {
  chatId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryaiChatsArgs = {
  serverId: Scalars['ID']['input'];
};


export type QueryboardArgs = {
  channelId: Scalars['ID']['input'];
};


export type QuerychannelArgs = {
  id: Scalars['ID']['input'];
};


export type QuerychannelMessagesArgs = {
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerychannelPresenceArgs = {
  channelId: Scalars['ID']['input'];
};


export type QuerycheckPRStatusesArgs = {
  branches: Array<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
};


export type QueryeventArgs = {
  id: Scalars['ID']['input'];
};


export type QuerygenerateBranchNameArgs = {
  prompt: Scalars['String']['input'];
};


export type QuerysessionEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sessionId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type QuerysessionsArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type QueryticketByWorkspaceIdArgs = {
  workspaceId: Scalars['ID']['input'];
};


export type QueryticketDependenciesArgs = {
  workspaceId: Scalars['ID']['input'];
};


export type QueryworkspaceArgs = {
  id: Scalars['ID']['input'];
};


export type QueryworkspaceEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  workspaceId: Scalars['ID']['input'];
};


export type QueryworkspacesArgs = {
  channelId: Scalars['ID']['input'];
  excludeStatus?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type Server = {
  __typename?: 'Server';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  channels: Array<Channel>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type Session = {
  __typename?: 'Session';
  createdAt: Scalars['DateTime']['output'];
  eventCount: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  workspaceId: Scalars['String']['output'];
};

export type SessionEventPayload = {
  __typename?: 'SessionEventPayload';
  channelId: Scalars['String']['output'];
  event: Event;
  sessionId: Scalars['String']['output'];
  workspaceId: Scalars['String']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  aiChatStream: AiChatStreamPayload;
  channelChangedInServer: ChannelChangeEvent;
  channelMessageCreated: ChannelMessage;
  channelMessageCreatedInServer: ChannelMessage;
  presenceUpdated: PresencePayload;
  sessionEventCreated: SessionEventPayload;
  sessionEventUpdated: SessionEventPayload;
  ticketReadyForReview: TicketReadyForReviewPayload;
  ticketReadyToRun: TicketReadyToRunPayload;
  ticketUpserted: TicketUpsertPayload;
  workspaceDeleted: WorkspaceDeletedPayload;
  workspaceUpserted: Workspace;
};


export type SubscriptionaiChatStreamArgs = {
  chatId: Scalars['ID']['input'];
};


export type SubscriptionchannelChangedInServerArgs = {
  serverId: Scalars['ID']['input'];
};


export type SubscriptionchannelMessageCreatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionchannelMessageCreatedInServerArgs = {
  serverId: Scalars['ID']['input'];
};


export type SubscriptionpresenceUpdatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionsessionEventCreatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionsessionEventUpdatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionticketReadyForReviewArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionticketReadyToRunArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionticketUpsertedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionworkspaceDeletedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionworkspaceUpsertedArgs = {
  channelId: Scalars['ID']['input'];
};

export type Ticket = {
  __typename?: 'Ticket';
  columnId: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  solutionApproach?: Maybe<Scalars['String']['output']>;
  sortOrder: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  workspace?: Maybe<TicketWorkspace>;
  workspaceId?: Maybe<Scalars['String']['output']>;
};

export type TicketAttachment = {
  __typename?: 'TicketAttachment';
  contentType: Scalars['String']['output'];
  filename: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type TicketDependency = {
  __typename?: 'TicketDependency';
  createdAt: Scalars['DateTime']['output'];
  dependsOnTicketTitle?: Maybe<Scalars['String']['output']>;
  dependsOnWorkspaceId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  ticketWorkspaceId: Scalars['String']['output'];
};

export type TicketReadyForReviewPayload = {
  __typename?: 'TicketReadyForReviewPayload';
  channelId: Scalars['String']['output'];
  runConfig: Scalars['JSON']['output'];
  workspaceId: Scalars['String']['output'];
};

export type TicketReadyToRunPayload = {
  __typename?: 'TicketReadyToRunPayload';
  channelId: Scalars['String']['output'];
  runConfig: Scalars['JSON']['output'];
  workspaceId: Scalars['String']['output'];
};

export type TicketUpsertPayload = {
  __typename?: 'TicketUpsertPayload';
  channelId: Scalars['String']['output'];
  columnSlug: Scalars['String']['output'];
  ticket: Ticket;
};

export type TicketWorkspace = {
  __typename?: 'TicketWorkspace';
  attachments: Array<TicketAttachment>;
  branch?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  prUrl?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type TokenUsage = {
  __typename?: 'TokenUsage';
  inputTokens: Scalars['Int']['output'];
  outputTokens: Scalars['Int']['output'];
  totalTokens: Scalars['Int']['output'];
};

export type Workspace = {
  __typename?: 'Workspace';
  agentSessionId?: Maybe<Scalars['String']['output']>;
  agentType?: Maybe<Scalars['String']['output']>;
  branch?: Maybe<Scalars['String']['output']>;
  channelId: Scalars['String']['output'];
  cliSession?: Maybe<WorkspaceCliSession>;
  cliSessionId: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  importance: Scalars['String']['output'];
  isProductDoc: Scalars['Boolean']['output'];
  preview?: Maybe<Scalars['String']['output']>;
  queuedRunConfig?: Maybe<Scalars['JSON']['output']>;
  sessionCount: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  user?: Maybe<WorkspaceUser>;
  userId?: Maybe<Scalars['String']['output']>;
};

export type WorkspaceCliSession = {
  __typename?: 'WorkspaceCliSession';
  cwd?: Maybe<Scalars['String']['output']>;
  sessionId: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type WorkspaceConnection = {
  __typename?: 'WorkspaceConnection';
  limit: Scalars['Int']['output'];
  mergedCount: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  workspaces: Array<Workspace>;
};

export type WorkspaceDeletedPayload = {
  __typename?: 'WorkspaceDeletedPayload';
  channelId: Scalars['String']['output'];
  workspaceId: Scalars['String']['output'];
};

export type WorkspacePresence = {
  __typename?: 'WorkspacePresence';
  viewers: Array<PresenceUser>;
  workspaceId: Scalars['ID']['output'];
};

export type WorkspaceUser = {
  __typename?: 'WorkspaceUser';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

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

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AiChat: ResolverTypeWrapper<AiChatMapper>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  AiChatMessage: ResolverTypeWrapper<AiChatMessageMapper>;
  AiChatMessageConnection: ResolverTypeWrapper<AiChatMessageConnectionMapper>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  AiChatStreamPayload: ResolverTypeWrapper<AiChatStreamPayloadMapper>;
  Attachment: ResolverTypeWrapper<AttachmentMapper>;
  AuthUser: ResolverTypeWrapper<AuthUserMapper>;
  Channel: ResolverTypeWrapper<ChannelMapper>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  ChannelChangeEvent: ResolverTypeWrapper<ChannelChangeEventMapper>;
  ChannelMessage: ResolverTypeWrapper<ChannelMessageMapper>;
  ChannelMessageAuthor: ResolverTypeWrapper<ChannelMessageAuthorMapper>;
  ChannelMessageConnection: ResolverTypeWrapper<ChannelMessageConnectionMapper>;
  CliSession: ResolverTypeWrapper<CliSessionMapper>;
  CliSessionConnection: ResolverTypeWrapper<CliSessionConnectionMapper>;
  CreateWorkspacePayload: ResolverTypeWrapper<CreateWorkspacePayloadMapper>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  Event: ResolverTypeWrapper<EventMapper>;
  EventConnection: ResolverTypeWrapper<EventConnectionMapper>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ImportTicketInput: ImportTicketInput;
  ImportedTicketResult: ResolverTypeWrapper<ImportedTicketResultMapper>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  KanbanColumn: ResolverTypeWrapper<KanbanColumnMapper>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PRStatus: ResolverTypeWrapper<PRStatusMapper>;
  PresencePayload: ResolverTypeWrapper<PresencePayloadMapper>;
  PresenceUser: ResolverTypeWrapper<PresenceUserMapper>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Server: ResolverTypeWrapper<ServerMapper>;
  Session: ResolverTypeWrapper<SessionMapper>;
  SessionEventPayload: ResolverTypeWrapper<SessionEventPayloadMapper>;
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Ticket: ResolverTypeWrapper<TicketMapper>;
  TicketAttachment: ResolverTypeWrapper<TicketAttachmentMapper>;
  TicketDependency: ResolverTypeWrapper<TicketDependency>;
  TicketReadyForReviewPayload: ResolverTypeWrapper<TicketReadyForReviewPayload>;
  TicketReadyToRunPayload: ResolverTypeWrapper<TicketReadyToRunPayload>;
  TicketUpsertPayload: ResolverTypeWrapper<TicketUpsertPayloadMapper>;
  TicketWorkspace: ResolverTypeWrapper<TicketWorkspaceMapper>;
  TokenUsage: ResolverTypeWrapper<TokenUsage>;
  Workspace: ResolverTypeWrapper<WorkspaceMapper>;
  WorkspaceCliSession: ResolverTypeWrapper<WorkspaceCliSessionMapper>;
  WorkspaceConnection: ResolverTypeWrapper<WorkspaceConnectionMapper>;
  WorkspaceDeletedPayload: ResolverTypeWrapper<WorkspaceDeletedPayloadMapper>;
  WorkspacePresence: ResolverTypeWrapper<WorkspacePresenceMapper>;
  WorkspaceUser: ResolverTypeWrapper<WorkspaceUserMapper>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AiChat: AiChatMapper;
  String: Scalars['String']['output'];
  ID: Scalars['ID']['output'];
  AiChatMessage: AiChatMessageMapper;
  AiChatMessageConnection: AiChatMessageConnectionMapper;
  Int: Scalars['Int']['output'];
  AiChatStreamPayload: AiChatStreamPayloadMapper;
  Attachment: AttachmentMapper;
  AuthUser: AuthUserMapper;
  Channel: ChannelMapper;
  Boolean: Scalars['Boolean']['output'];
  ChannelChangeEvent: ChannelChangeEventMapper;
  ChannelMessage: ChannelMessageMapper;
  ChannelMessageAuthor: ChannelMessageAuthorMapper;
  ChannelMessageConnection: ChannelMessageConnectionMapper;
  CliSession: CliSessionMapper;
  CliSessionConnection: CliSessionConnectionMapper;
  CreateWorkspacePayload: CreateWorkspacePayloadMapper;
  DateTime: Scalars['DateTime']['output'];
  Event: EventMapper;
  EventConnection: EventConnectionMapper;
  Float: Scalars['Float']['output'];
  ImportTicketInput: ImportTicketInput;
  ImportedTicketResult: ImportedTicketResultMapper;
  JSON: Scalars['JSON']['output'];
  KanbanColumn: KanbanColumnMapper;
  Mutation: Record<PropertyKey, never>;
  PRStatus: PRStatusMapper;
  PresencePayload: PresencePayloadMapper;
  PresenceUser: PresenceUserMapper;
  Query: Record<PropertyKey, never>;
  Server: ServerMapper;
  Session: SessionMapper;
  SessionEventPayload: SessionEventPayloadMapper;
  Subscription: Record<PropertyKey, never>;
  Ticket: TicketMapper;
  TicketAttachment: TicketAttachmentMapper;
  TicketDependency: TicketDependency;
  TicketReadyForReviewPayload: TicketReadyForReviewPayload;
  TicketReadyToRunPayload: TicketReadyToRunPayload;
  TicketUpsertPayload: TicketUpsertPayloadMapper;
  TicketWorkspace: TicketWorkspaceMapper;
  TokenUsage: TokenUsage;
  Workspace: WorkspaceMapper;
  WorkspaceCliSession: WorkspaceCliSessionMapper;
  WorkspaceConnection: WorkspaceConnectionMapper;
  WorkspaceDeletedPayload: WorkspaceDeletedPayloadMapper;
  WorkspacePresence: WorkspacePresenceMapper;
  WorkspaceUser: WorkspaceUserMapper;
};

export type AiChatResolvers<ContextType = any, ParentType extends ResolversParentTypes['AiChat'] = ResolversParentTypes['AiChat']> = {
  channelId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastMessage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  serverId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type AiChatMessageResolvers<ContextType = any, ParentType extends ResolversParentTypes['AiChatMessage'] = ResolversParentTypes['AiChatMessage']> = {
  chatId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  content?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type AiChatMessageConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['AiChatMessageConnection'] = ResolversParentTypes['AiChatMessageConnection']> = {
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['AiChatMessage']>, ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type AiChatStreamPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['AiChatStreamPayload'] = ResolversParentTypes['AiChatStreamPayload']> = {
  chatId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  content?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  delta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type AttachmentResolvers<ContextType = any, ParentType extends ResolversParentTypes['Attachment'] = ResolversParentTypes['Attachment']> = {
  byteSize?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  contentType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  filename?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  localPath?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type AuthUserResolvers<ContextType = any, ParentType extends ResolversParentTypes['AuthUser'] = ResolversParentTypes['AuthUser']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  githubUsername?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ChannelResolvers<ContextType = any, ParentType extends ResolversParentTypes['Channel'] = ResolversParentTypes['Channel']> = {
  baseBranch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  defaultRepoPath?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  defaultRunScript?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  defaultSetupScript?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  githubUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  serverId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  teamIds?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  workspacesEnabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type ChannelChangeEventResolvers<ContextType = any, ParentType extends ResolversParentTypes['ChannelChangeEvent'] = ResolversParentTypes['ChannelChangeEvent']> = {
  action?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ChannelMessageResolvers<ContextType = any, ParentType extends ResolversParentTypes['ChannelMessage'] = ResolversParentTypes['ChannelMessage']> = {
  author?: Resolver<ResolversTypes['ChannelMessageAuthor'], ParentType, ContextType>;
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  content?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type ChannelMessageAuthorResolvers<ContextType = any, ParentType extends ResolversParentTypes['ChannelMessageAuthor'] = ResolversParentTypes['ChannelMessageAuthor']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ChannelMessageConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ChannelMessageConnection'] = ResolversParentTypes['ChannelMessageConnection']> = {
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['ChannelMessage']>, ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CliSessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['CliSession'] = ResolversParentTypes['CliSession']> = {
  cwd?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  eventCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  firstSeenAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastSeenAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  permissionMode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  toolSummary?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  transcriptPath?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type CliSessionConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['CliSessionConnection'] = ResolversParentTypes['CliSessionConnection']> = {
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['CliSession']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CreateWorkspacePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateWorkspacePayload'] = ResolversParentTypes['CreateWorkspacePayload']> = {
  event?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType>;
  session?: Resolver<ResolversTypes['Session'], ParentType, ContextType>;
  workspace?: Resolver<ResolversTypes['Workspace'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type EventResolvers<ContextType = any, ParentType extends ResolversParentTypes['Event'] = ResolversParentTypes['Event']> = {
  cliSessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hookEventName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  importance?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastAssistantMessage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rawPayload?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  stopHookActive?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  toolInput?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  toolName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  toolResponse?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  toolUseId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type EventConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['EventConnection'] = ResolversParentTypes['EventConnection']> = {
  cliCostUsd?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  events?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType>;
  latestContextTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tokenUsage?: Resolver<Maybe<ResolversTypes['TokenUsage']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ImportedTicketResultResolvers<ContextType = any, ParentType extends ResolversParentTypes['ImportedTicketResult'] = ResolversParentTypes['ImportedTicketResult']> = {
  ticketId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ticketJsonId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export interface JSONScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type KanbanColumnResolvers<ContextType = any, ParentType extends ResolversParentTypes['KanbanColumn'] = ResolversParentTypes['KanbanColumn']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  color?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sortOrder?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tickets?: Resolver<Array<ResolversTypes['Ticket']>, ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  appendPrompt?: Resolver<ResolversTypes['CreateWorkspacePayload'], ParentType, ContextType, RequireFields<MutationappendPromptArgs, 'channelId' | 'text' | 'workspaceId'>>;
  createAiChat?: Resolver<ResolversTypes['AiChat'], ParentType, ContextType, RequireFields<MutationcreateAiChatArgs, 'serverId'>>;
  createChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationcreateChannelArgs, 'name'>>;
  createColumn?: Resolver<ResolversTypes['KanbanColumn'], ParentType, ContextType, RequireFields<MutationcreateColumnArgs, 'channelId' | 'name' | 'slug'>>;
  createServer?: Resolver<ResolversTypes['Server'], ParentType, ContextType, RequireFields<MutationcreateServerArgs, 'name'>>;
  createSession?: Resolver<ResolversTypes['Session'], ParentType, ContextType, RequireFields<MutationcreateSessionArgs, 'channelId' | 'workspaceId'>>;
  createWorkspace?: Resolver<ResolversTypes['CreateWorkspacePayload'], ParentType, ContextType, RequireFields<MutationcreateWorkspaceArgs, 'channelId' | 'text'>>;
  deleteAiChat?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteAiChatArgs, 'id'>>;
  deleteChannel?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteChannelArgs, 'id'>>;
  deleteColumn?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteColumnArgs, 'columnId'>>;
  deleteWorkspace?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteWorkspaceArgs, 'channelId' | 'workspaceId'>>;
  handoffWorkspace?: Resolver<ResolversTypes['Workspace'], ParentType, ContextType, RequireFields<MutationhandoffWorkspaceArgs, 'channelId' | 'workspaceId'>>;
  importTicketsToProject?: Resolver<Array<ResolversTypes['ImportedTicketResult']>, ParentType, ContextType, RequireFields<MutationimportTicketsToProjectArgs, 'channelId' | 'runConfig' | 'tickets'>>;
  moveTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationmoveTicketArgs, 'columnId' | 'ticketId'>>;
  removeTicketDependency?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationremoveTicketDependencyArgs, 'channelId' | 'dependsOnWorkspaceId' | 'workspaceId'>>;
  renameAiChat?: Resolver<ResolversTypes['AiChat'], ParentType, ContextType, RequireFields<MutationrenameAiChatArgs, 'id' | 'title'>>;
  reportPresence?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationreportPresenceArgs, 'channelId'>>;
  sendAiChatMessage?: Resolver<ResolversTypes['AiChatMessage'], ParentType, ContextType, RequireFields<MutationsendAiChatMessageArgs, 'chatId' | 'content'>>;
  sendChannelMessage?: Resolver<ResolversTypes['ChannelMessage'], ParentType, ContextType, RequireFields<MutationsendChannelMessageArgs, 'channelId' | 'content'>>;
  setTicketDependencies?: Resolver<ResolversTypes['Workspace'], ParentType, ContextType, RequireFields<MutationsetTicketDependenciesArgs, 'channelId' | 'dependsOnWorkspaceIds' | 'runConfig' | 'workspaceId'>>;
  setWorkspacePrUrl?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationsetWorkspacePrUrlArgs, 'channelId' | 'prUrl' | 'workspaceId'>>;
  updateChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationupdateChannelArgs, 'id'>>;
  updateColumn?: Resolver<ResolversTypes['KanbanColumn'], ParentType, ContextType, RequireFields<MutationupdateColumnArgs, 'columnId'>>;
  updateInitialPrompt?: Resolver<ResolversTypes['CreateWorkspacePayload'], ParentType, ContextType, RequireFields<MutationupdateInitialPromptArgs, 'channelId' | 'text' | 'workspaceId'>>;
  updateQueuedRunConfig?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationupdateQueuedRunConfigArgs, 'runConfig' | 'workspaceId'>>;
  updateWorkspacePreview?: Resolver<ResolversTypes['Workspace'], ParentType, ContextType, RequireFields<MutationupdateWorkspacePreviewArgs, 'channelId' | 'preview' | 'workspaceId'>>;
  updateWorkspaceStatus?: Resolver<ResolversTypes['Workspace'], ParentType, ContextType, RequireFields<MutationupdateWorkspaceStatusArgs, 'channelId' | 'status' | 'workspaceId'>>;
  uploadAttachment?: Resolver<ResolversTypes['Attachment'], ParentType, ContextType, RequireFields<MutationuploadAttachmentArgs, 'contentType' | 'data' | 'filename'>>;
};

export type PRStatusResolvers<ContextType = any, ParentType extends ResolversParentTypes['PRStatus'] = ResolversParentTypes['PRStatus']> = {
  branch?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hasPR?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  merged?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  prUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type PresencePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['PresencePayload'] = ResolversParentTypes['PresencePayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  presence?: Resolver<Array<ResolversTypes['WorkspacePresence']>, ParentType, ContextType>;
};

export type PresenceUserResolvers<ContextType = any, ParentType extends ResolversParentTypes['PresenceUser'] = ResolversParentTypes['PresenceUser']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  aiChatMessages?: Resolver<ResolversTypes['AiChatMessageConnection'], ParentType, ContextType, RequireFields<QueryaiChatMessagesArgs, 'chatId'>>;
  aiChats?: Resolver<Array<ResolversTypes['AiChat']>, ParentType, ContextType, RequireFields<QueryaiChatsArgs, 'serverId'>>;
  board?: Resolver<Array<ResolversTypes['KanbanColumn']>, ParentType, ContextType, RequireFields<QueryboardArgs, 'channelId'>>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QuerychannelArgs, 'id'>>;
  channelMessages?: Resolver<ResolversTypes['ChannelMessageConnection'], ParentType, ContextType, RequireFields<QuerychannelMessagesArgs, 'channelId'>>;
  channelPresence?: Resolver<Array<ResolversTypes['WorkspacePresence']>, ParentType, ContextType, RequireFields<QuerychannelPresenceArgs, 'channelId'>>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  checkPRStatuses?: Resolver<Array<ResolversTypes['PRStatus']>, ParentType, ContextType, RequireFields<QuerycheckPRStatusesArgs, 'branches' | 'channelId'>>;
  event?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryeventArgs, 'id'>>;
  generateBranchName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QuerygenerateBranchNameArgs, 'prompt'>>;
  me?: Resolver<Maybe<ResolversTypes['AuthUser']>, ParentType, ContextType>;
  servers?: Resolver<Array<ResolversTypes['Server']>, ParentType, ContextType>;
  sessionEvents?: Resolver<ResolversTypes['EventConnection'], ParentType, ContextType, RequireFields<QuerysessionEventsArgs, 'channelId' | 'sessionId' | 'workspaceId'>>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerysessionsArgs, 'channelId' | 'workspaceId'>>;
  ticketByWorkspaceId?: Resolver<Maybe<ResolversTypes['Ticket']>, ParentType, ContextType, RequireFields<QueryticketByWorkspaceIdArgs, 'workspaceId'>>;
  ticketDependencies?: Resolver<Array<ResolversTypes['TicketDependency']>, ParentType, ContextType, RequireFields<QueryticketDependenciesArgs, 'workspaceId'>>;
  workspace?: Resolver<Maybe<ResolversTypes['Workspace']>, ParentType, ContextType, RequireFields<QueryworkspaceArgs, 'id'>>;
  workspaceEvents?: Resolver<ResolversTypes['EventConnection'], ParentType, ContextType, RequireFields<QueryworkspaceEventsArgs, 'channelId' | 'workspaceId'>>;
  workspaces?: Resolver<ResolversTypes['WorkspaceConnection'], ParentType, ContextType, RequireFields<QueryworkspacesArgs, 'channelId'>>;
};

export type ServerResolvers<ContextType = any, ParentType extends ResolversParentTypes['Server'] = ResolversParentTypes['Server']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type SessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Session'] = ResolversParentTypes['Session']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  eventCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type SessionEventPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['SessionEventPayload'] = ResolversParentTypes['SessionEventPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  event?: Resolver<ResolversTypes['Event'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type SubscriptionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  aiChatStream?: SubscriptionResolver<ResolversTypes['AiChatStreamPayload'], "aiChatStream", ParentType, ContextType, RequireFields<SubscriptionaiChatStreamArgs, 'chatId'>>;
  channelChangedInServer?: SubscriptionResolver<ResolversTypes['ChannelChangeEvent'], "channelChangedInServer", ParentType, ContextType, RequireFields<SubscriptionchannelChangedInServerArgs, 'serverId'>>;
  channelMessageCreated?: SubscriptionResolver<ResolversTypes['ChannelMessage'], "channelMessageCreated", ParentType, ContextType, RequireFields<SubscriptionchannelMessageCreatedArgs, 'channelId'>>;
  channelMessageCreatedInServer?: SubscriptionResolver<ResolversTypes['ChannelMessage'], "channelMessageCreatedInServer", ParentType, ContextType, RequireFields<SubscriptionchannelMessageCreatedInServerArgs, 'serverId'>>;
  presenceUpdated?: SubscriptionResolver<ResolversTypes['PresencePayload'], "presenceUpdated", ParentType, ContextType, RequireFields<SubscriptionpresenceUpdatedArgs, 'channelId'>>;
  sessionEventCreated?: SubscriptionResolver<ResolversTypes['SessionEventPayload'], "sessionEventCreated", ParentType, ContextType, RequireFields<SubscriptionsessionEventCreatedArgs, 'channelId'>>;
  sessionEventUpdated?: SubscriptionResolver<ResolversTypes['SessionEventPayload'], "sessionEventUpdated", ParentType, ContextType, RequireFields<SubscriptionsessionEventUpdatedArgs, 'channelId'>>;
  ticketReadyForReview?: SubscriptionResolver<ResolversTypes['TicketReadyForReviewPayload'], "ticketReadyForReview", ParentType, ContextType, RequireFields<SubscriptionticketReadyForReviewArgs, 'channelId'>>;
  ticketReadyToRun?: SubscriptionResolver<ResolversTypes['TicketReadyToRunPayload'], "ticketReadyToRun", ParentType, ContextType, RequireFields<SubscriptionticketReadyToRunArgs, 'channelId'>>;
  ticketUpserted?: SubscriptionResolver<ResolversTypes['TicketUpsertPayload'], "ticketUpserted", ParentType, ContextType, RequireFields<SubscriptionticketUpsertedArgs, 'channelId'>>;
  workspaceDeleted?: SubscriptionResolver<ResolversTypes['WorkspaceDeletedPayload'], "workspaceDeleted", ParentType, ContextType, RequireFields<SubscriptionworkspaceDeletedArgs, 'channelId'>>;
  workspaceUpserted?: SubscriptionResolver<ResolversTypes['Workspace'], "workspaceUpserted", ParentType, ContextType, RequireFields<SubscriptionworkspaceUpsertedArgs, 'channelId'>>;
};

export type TicketResolvers<ContextType = any, ParentType extends ResolversParentTypes['Ticket'] = ResolversParentTypes['Ticket']> = {
  columnId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  solutionApproach?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sortOrder?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  workspace?: Resolver<Maybe<ResolversTypes['TicketWorkspace']>, ParentType, ContextType>;
  workspaceId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type TicketAttachmentResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketAttachment'] = ResolversParentTypes['TicketAttachment']> = {
  contentType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  filename?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketDependencyResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketDependency'] = ResolversParentTypes['TicketDependency']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  dependsOnTicketTitle?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  dependsOnWorkspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ticketWorkspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketReadyForReviewPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketReadyForReviewPayload'] = ResolversParentTypes['TicketReadyForReviewPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  runConfig?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketReadyToRunPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketReadyToRunPayload'] = ResolversParentTypes['TicketReadyToRunPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  runConfig?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketUpsertPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketUpsertPayload'] = ResolversParentTypes['TicketUpsertPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  columnSlug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ticket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType>;
};

export type TicketWorkspaceResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketWorkspace'] = ResolversParentTypes['TicketWorkspace']> = {
  attachments?: Resolver<Array<ResolversTypes['TicketAttachment']>, ParentType, ContextType>;
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  prUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TokenUsageResolvers<ContextType = any, ParentType extends ResolversParentTypes['TokenUsage'] = ResolversParentTypes['TokenUsage']> = {
  inputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  outputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type WorkspaceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Workspace'] = ResolversParentTypes['Workspace']> = {
  agentSessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  agentType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  cliSession?: Resolver<Maybe<ResolversTypes['WorkspaceCliSession']>, ParentType, ContextType>;
  cliSessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  importance?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isProductDoc?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  preview?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  queuedRunConfig?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  sessionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  user?: Resolver<Maybe<ResolversTypes['WorkspaceUser']>, ParentType, ContextType>;
  userId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type WorkspaceCliSessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WorkspaceCliSession'] = ResolversParentTypes['WorkspaceCliSession']> = {
  cwd?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type WorkspaceConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WorkspaceConnection'] = ResolversParentTypes['WorkspaceConnection']> = {
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  mergedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  workspaces?: Resolver<Array<ResolversTypes['Workspace']>, ParentType, ContextType>;
};

export type WorkspaceDeletedPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['WorkspaceDeletedPayload'] = ResolversParentTypes['WorkspaceDeletedPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type WorkspacePresenceResolvers<ContextType = any, ParentType extends ResolversParentTypes['WorkspacePresence'] = ResolversParentTypes['WorkspacePresence']> = {
  viewers?: Resolver<Array<ResolversTypes['PresenceUser']>, ParentType, ContextType>;
  workspaceId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type WorkspaceUserResolvers<ContextType = any, ParentType extends ResolversParentTypes['WorkspaceUser'] = ResolversParentTypes['WorkspaceUser']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  AiChat?: AiChatResolvers<ContextType>;
  AiChatMessage?: AiChatMessageResolvers<ContextType>;
  AiChatMessageConnection?: AiChatMessageConnectionResolvers<ContextType>;
  AiChatStreamPayload?: AiChatStreamPayloadResolvers<ContextType>;
  Attachment?: AttachmentResolvers<ContextType>;
  AuthUser?: AuthUserResolvers<ContextType>;
  Channel?: ChannelResolvers<ContextType>;
  ChannelChangeEvent?: ChannelChangeEventResolvers<ContextType>;
  ChannelMessage?: ChannelMessageResolvers<ContextType>;
  ChannelMessageAuthor?: ChannelMessageAuthorResolvers<ContextType>;
  ChannelMessageConnection?: ChannelMessageConnectionResolvers<ContextType>;
  CliSession?: CliSessionResolvers<ContextType>;
  CliSessionConnection?: CliSessionConnectionResolvers<ContextType>;
  CreateWorkspacePayload?: CreateWorkspacePayloadResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  Event?: EventResolvers<ContextType>;
  EventConnection?: EventConnectionResolvers<ContextType>;
  ImportedTicketResult?: ImportedTicketResultResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  KanbanColumn?: KanbanColumnResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PRStatus?: PRStatusResolvers<ContextType>;
  PresencePayload?: PresencePayloadResolvers<ContextType>;
  PresenceUser?: PresenceUserResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Server?: ServerResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  SessionEventPayload?: SessionEventPayloadResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Ticket?: TicketResolvers<ContextType>;
  TicketAttachment?: TicketAttachmentResolvers<ContextType>;
  TicketDependency?: TicketDependencyResolvers<ContextType>;
  TicketReadyForReviewPayload?: TicketReadyForReviewPayloadResolvers<ContextType>;
  TicketReadyToRunPayload?: TicketReadyToRunPayloadResolvers<ContextType>;
  TicketUpsertPayload?: TicketUpsertPayloadResolvers<ContextType>;
  TicketWorkspace?: TicketWorkspaceResolvers<ContextType>;
  TokenUsage?: TokenUsageResolvers<ContextType>;
  Workspace?: WorkspaceResolvers<ContextType>;
  WorkspaceCliSession?: WorkspaceCliSessionResolvers<ContextType>;
  WorkspaceConnection?: WorkspaceConnectionResolvers<ContextType>;
  WorkspaceDeletedPayload?: WorkspaceDeletedPayloadResolvers<ContextType>;
  WorkspacePresence?: WorkspacePresenceResolvers<ContextType>;
  WorkspaceUser?: WorkspaceUserResolvers<ContextType>;
};

