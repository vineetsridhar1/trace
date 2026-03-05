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
  JSON: { input: unknown; output: unknown; }
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


export type MutationAppendPromptArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  createNewSession?: InputMaybe<Scalars['Boolean']['input']>;
  sessionId?: InputMaybe<Scalars['ID']['input']>;
  text: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationCreateAiChatArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  serverId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateChannelArgs = {
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


export type MutationCreateColumnArgs = {
  channelId: Scalars['ID']['input'];
  color?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};


export type MutationCreateServerArgs = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};


export type MutationCreateSessionArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationCreateWorkspaceArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  isProductDoc?: InputMaybe<Scalars['Boolean']['input']>;
  text: Scalars['String']['input'];
  ticketId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationDeleteAiChatArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteChannelArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteColumnArgs = {
  columnId: Scalars['ID']['input'];
};


export type MutationDeleteWorkspaceArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationHandoffWorkspaceArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationImportTicketsToProjectArgs = {
  channelId: Scalars['ID']['input'];
  runConfig: Scalars['JSON']['input'];
  tickets: Array<ImportTicketInput>;
};


export type MutationMoveTicketArgs = {
  columnId: Scalars['ID']['input'];
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
  ticketId: Scalars['ID']['input'];
};


export type MutationRemoveTicketDependencyArgs = {
  channelId: Scalars['ID']['input'];
  dependsOnWorkspaceId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationRenameAiChatArgs = {
  id: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationReportPresenceArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationSendAiChatMessageArgs = {
  chatId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationSendChannelMessageArgs = {
  channelId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationSetTicketDependenciesArgs = {
  channelId: Scalars['ID']['input'];
  dependsOnWorkspaceIds: Array<Scalars['ID']['input']>;
  runConfig: Scalars['JSON']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationSetWorkspacePrUrlArgs = {
  channelId: Scalars['ID']['input'];
  prUrl: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationUpdateChannelArgs = {
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


export type MutationUpdateColumnArgs = {
  color?: InputMaybe<Scalars['String']['input']>;
  columnId: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationUpdateInitialPromptArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationUpdateQueuedRunConfigArgs = {
  runConfig: Scalars['JSON']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationUpdateWorkspacePreviewArgs = {
  channelId: Scalars['ID']['input'];
  preview: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationUpdateWorkspaceStatusArgs = {
  channelId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type MutationUploadAttachmentArgs = {
  contentType: Scalars['String']['input'];
  data: Scalars['String']['input'];
  filename: Scalars['String']['input'];
};

export type PrStatus = {
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
  checkPRStatuses: Array<PrStatus>;
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


export type QueryAiChatMessagesArgs = {
  chatId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAiChatsArgs = {
  serverId: Scalars['ID']['input'];
};


export type QueryBoardArgs = {
  channelId: Scalars['ID']['input'];
};


export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChannelMessagesArgs = {
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryChannelPresenceArgs = {
  channelId: Scalars['ID']['input'];
};


export type QueryCheckPrStatusesArgs = {
  branches: Array<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
};


export type QueryEventArgs = {
  id: Scalars['ID']['input'];
};


export type QueryGenerateBranchNameArgs = {
  prompt: Scalars['String']['input'];
};


export type QuerySessionEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sessionId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type QuerySessionsArgs = {
  channelId: Scalars['ID']['input'];
  workspaceId: Scalars['ID']['input'];
};


export type QueryTicketByWorkspaceIdArgs = {
  workspaceId: Scalars['ID']['input'];
};


export type QueryTicketDependenciesArgs = {
  workspaceId: Scalars['ID']['input'];
};


export type QueryWorkspaceArgs = {
  id: Scalars['ID']['input'];
};


export type QueryWorkspaceEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  workspaceId: Scalars['ID']['input'];
};


export type QueryWorkspacesArgs = {
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


export type SubscriptionAiChatStreamArgs = {
  chatId: Scalars['ID']['input'];
};


export type SubscriptionChannelChangedInServerArgs = {
  serverId: Scalars['ID']['input'];
};


export type SubscriptionChannelMessageCreatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionChannelMessageCreatedInServerArgs = {
  serverId: Scalars['ID']['input'];
};


export type SubscriptionPresenceUpdatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionSessionEventCreatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionSessionEventUpdatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionTicketReadyForReviewArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionTicketReadyToRunArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionTicketUpsertedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionWorkspaceDeletedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionWorkspaceUpsertedArgs = {
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
