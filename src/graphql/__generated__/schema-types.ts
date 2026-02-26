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

export type Channel = {
  __typename?: 'Channel';
  baseBranch?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  githubUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  serverId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CreateMessagePayload = {
  __typename?: 'CreateMessagePayload';
  event: Event;
  message: Message;
  thread: Thread;
};

export type Event = {
  __typename?: 'Event';
  hookEventName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  importance: Scalars['String']['output'];
  lastAssistantMessage?: Maybe<Scalars['String']['output']>;
  rawPayload: Scalars['JSON']['output'];
  sessionId: Scalars['String']['output'];
  stopHookActive?: Maybe<Scalars['Boolean']['output']>;
  threadId: Scalars['String']['output'];
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
  latestContextTokens: Scalars['Int']['output'];
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  tokenUsage: TokenUsage;
  total: Scalars['Int']['output'];
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

export type Message = {
  __typename?: 'Message';
  branch?: Maybe<Scalars['String']['output']>;
  channelId: Scalars['String']['output'];
  claudeSessionId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  importance: Scalars['String']['output'];
  preview?: Maybe<Scalars['String']['output']>;
  session?: Maybe<MessageSession>;
  sessionId: Scalars['String']['output'];
  status: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  threadCount: Scalars['Int']['output'];
};

export type MessageConnection = {
  __typename?: 'MessageConnection';
  limit: Scalars['Int']['output'];
  messages: Array<Message>;
  offset: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type MessageDeletedPayload = {
  __typename?: 'MessageDeletedPayload';
  channelId: Scalars['String']['output'];
  messageId: Scalars['String']['output'];
};

export type MessageSession = {
  __typename?: 'MessageSession';
  cwd?: Maybe<Scalars['String']['output']>;
  sessionId: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  appendPrompt: CreateMessagePayload;
  createAiChat: AiChat;
  createChannel: Channel;
  createColumn: KanbanColumn;
  createMessage: CreateMessagePayload;
  createServer: Server;
  createThread: Thread;
  deleteAiChat: Scalars['Boolean']['output'];
  deleteColumn: Scalars['Boolean']['output'];
  deleteMessage: Scalars['Boolean']['output'];
  moveTicket: Ticket;
  renameAiChat: AiChat;
  sendAiChatMessage: AiChatMessage;
  updateChannel: Channel;
  updateColumn: KanbanColumn;
  updateMessagePreview: Message;
  updateMessageStatus: Message;
  uploadAttachment: Attachment;
};


export type MutationAppendPromptArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  createNewThread?: InputMaybe<Scalars['Boolean']['input']>;
  messageId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
  threadId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateAiChatArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  serverId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateChannelArgs = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  githubUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  serverId?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateColumnArgs = {
  channelId: Scalars['ID']['input'];
  color?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};


export type MutationCreateMessageArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationCreateServerArgs = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};


export type MutationCreateThreadArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationDeleteAiChatArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteColumnArgs = {
  columnId: Scalars['ID']['input'];
};


export type MutationDeleteMessageArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationMoveTicketArgs = {
  columnId: Scalars['ID']['input'];
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
  ticketId: Scalars['ID']['input'];
};


export type MutationRenameAiChatArgs = {
  id: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationSendAiChatMessageArgs = {
  chatId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationUpdateChannelArgs = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  githubUrl?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateColumnArgs = {
  color?: InputMaybe<Scalars['String']['input']>;
  columnId: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationUpdateMessagePreviewArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
  preview: Scalars['String']['input'];
};


export type MutationUpdateMessageStatusArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationUploadAttachmentArgs = {
  contentType: Scalars['String']['input'];
  data: Scalars['String']['input'];
  filename: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  aiChatMessages: AiChatMessageConnection;
  aiChats: Array<AiChat>;
  board: Array<KanbanColumn>;
  channel?: Maybe<Channel>;
  channels: Array<Channel>;
  event?: Maybe<Event>;
  messageEvents: EventConnection;
  messages: MessageConnection;
  repoBranches: Array<Scalars['String']['output']>;
  servers: Array<Server>;
  session?: Maybe<Session>;
  sessionEvents: EventConnection;
  sessions: SessionConnection;
  threadEvents: EventConnection;
  threads: Array<Thread>;
  validateRepo: RepoValidation;
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


export type QueryEventArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMessageEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  messageId: Scalars['ID']['input'];
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMessagesArgs = {
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryRepoBranchesArgs = {
  localRepoPath: Scalars['String']['input'];
};


export type QuerySessionArgs = {
  sessionId: Scalars['String']['input'];
};


export type QuerySessionEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  hookEventName?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sessionId: Scalars['String']['input'];
  toolName?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySessionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryThreadEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  messageId: Scalars['ID']['input'];
  offset?: InputMaybe<Scalars['Int']['input']>;
  threadId: Scalars['ID']['input'];
};


export type QueryThreadsArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type QueryValidateRepoArgs = {
  localRepoPath: Scalars['String']['input'];
};

export type RepoValidation = {
  __typename?: 'RepoValidation';
  error?: Maybe<Scalars['String']['output']>;
  originUrl?: Maybe<Scalars['String']['output']>;
  valid: Scalars['Boolean']['output'];
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

export type SessionConnection = {
  __typename?: 'SessionConnection';
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  sessions: Array<Session>;
  total: Scalars['Int']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  aiChatStream: AiChatStreamPayload;
  messageDeleted: MessageDeletedPayload;
  messageUpserted: Message;
  threadEventCreated: ThreadEventPayload;
  threadEventUpdated: ThreadEventPayload;
  ticketUpserted: TicketUpsertPayload;
};


export type SubscriptionAiChatStreamArgs = {
  chatId: Scalars['ID']['input'];
};


export type SubscriptionMessageDeletedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionMessageUpsertedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionThreadEventCreatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionThreadEventUpdatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionTicketUpsertedArgs = {
  channelId: Scalars['ID']['input'];
};

export type Thread = {
  __typename?: 'Thread';
  createdAt: Scalars['DateTime']['output'];
  eventCount: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  messageId: Scalars['String']['output'];
};

export type ThreadEventPayload = {
  __typename?: 'ThreadEventPayload';
  channelId: Scalars['String']['output'];
  event: Event;
  messageId: Scalars['String']['output'];
  threadId: Scalars['String']['output'];
};

export type Ticket = {
  __typename?: 'Ticket';
  columnId: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  message?: Maybe<TicketMessage>;
  messageId: Scalars['String']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  solutionApproach?: Maybe<Scalars['String']['output']>;
  sortOrder: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TicketAttachment = {
  __typename?: 'TicketAttachment';
  contentType: Scalars['String']['output'];
  filename: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type TicketMessage = {
  __typename?: 'TicketMessage';
  attachments: Array<TicketAttachment>;
  branch?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  status: Scalars['String']['output'];
};

export type TicketUpsertPayload = {
  __typename?: 'TicketUpsertPayload';
  channelId: Scalars['String']['output'];
  columnSlug: Scalars['String']['output'];
  ticket: Ticket;
};

export type TokenUsage = {
  __typename?: 'TokenUsage';
  inputTokens: Scalars['Int']['output'];
  outputTokens: Scalars['Int']['output'];
  totalTokens: Scalars['Int']['output'];
};
