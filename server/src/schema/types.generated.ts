import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { AiChatMapper, AiChatMessageMapper, AiChatMessageConnectionMapper, AiChatStreamPayloadMapper } from './aiChat/schema.mappers';
import { AttachmentMapper } from './attachment/schema.mappers';
import { ChannelMapper } from './channel/schema.mappers';
import { CreateMessagePayloadMapper, MessageMapper, MessageConnectionMapper, MessageDeletedPayloadMapper, MessageSessionMapper } from './message/schema.mappers';
import { EventMapper, EventConnectionMapper, ThreadEventPayloadMapper } from './event/schema.mappers';
import { KanbanColumnMapper, TicketMapper, TicketAttachmentMapper, TicketMessageMapper, TicketUpsertPayloadMapper } from './kanban/schema.mappers';
import { ServerMapper } from './server/schema.mappers';
import { SessionMapper, SessionConnectionMapper } from './session/schema.mappers';
import { ThreadMapper } from './thread/schema.mappers';
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
  events: Array<Event>;
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
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
  queuedRunConfig?: Maybe<Scalars['JSON']['output']>;
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

export type MessageReadyForReviewPayload = {
  __typename?: 'MessageReadyForReviewPayload';
  channelId: Scalars['String']['output'];
  claudeSessionId?: Maybe<Scalars['String']['output']>;
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
  removeTicketDependency: Scalars['Boolean']['output'];
  renameAiChat: AiChat;
  sendAiChatMessage: AiChatMessage;
  setTicketDependencies: Message;
  updateChannel: Channel;
  updateColumn: KanbanColumn;
  updateMessagePreview: Message;
  updateMessageStatus: Message;
  updateQueuedRunConfig: Scalars['Boolean']['output'];
  uploadAttachment: Attachment;
};


export type MutationappendPromptArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  createNewThread?: InputMaybe<Scalars['Boolean']['input']>;
  messageId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
  threadId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationcreateAiChatArgs = {
  channelId?: InputMaybe<Scalars['ID']['input']>;
  serverId: Scalars['ID']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};


export type MutationcreateChannelArgs = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  githubUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  serverId?: InputMaybe<Scalars['String']['input']>;
};


export type MutationcreateColumnArgs = {
  channelId: Scalars['ID']['input'];
  color?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};


export type MutationcreateMessageArgs = {
  attachmentIds?: InputMaybe<Array<Scalars['String']['input']>>;
  channelId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationcreateServerArgs = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};


export type MutationcreateThreadArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationdeleteAiChatArgs = {
  id: Scalars['ID']['input'];
};


export type MutationdeleteColumnArgs = {
  columnId: Scalars['ID']['input'];
};


export type MutationdeleteMessageArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationmoveTicketArgs = {
  columnId: Scalars['ID']['input'];
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
  ticketId: Scalars['ID']['input'];
};


export type MutationremoveTicketDependencyArgs = {
  channelId: Scalars['ID']['input'];
  dependsOnMessageId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type MutationrenameAiChatArgs = {
  id: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};


export type MutationsendAiChatMessageArgs = {
  chatId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};


export type MutationsetTicketDependenciesArgs = {
  channelId: Scalars['ID']['input'];
  dependsOnMessageIds: Array<Scalars['ID']['input']>;
  messageId: Scalars['ID']['input'];
  runConfig: Scalars['JSON']['input'];
};


export type MutationupdateChannelArgs = {
  baseBranch?: InputMaybe<Scalars['String']['input']>;
  defaultRepoPath?: InputMaybe<Scalars['String']['input']>;
  defaultRunScript?: InputMaybe<Scalars['String']['input']>;
  defaultSetupScript?: InputMaybe<Scalars['String']['input']>;
  githubUrl?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};


export type MutationupdateColumnArgs = {
  color?: InputMaybe<Scalars['String']['input']>;
  columnId: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationupdateMessagePreviewArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
  preview: Scalars['String']['input'];
};


export type MutationupdateMessageStatusArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
};


export type MutationupdateQueuedRunConfigArgs = {
  messageId: Scalars['ID']['input'];
  runConfig: Scalars['JSON']['input'];
};


export type MutationuploadAttachmentArgs = {
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
  servers: Array<Server>;
  session?: Maybe<Session>;
  sessionEvents: EventConnection;
  sessions: SessionConnection;
  threadEvents: EventConnection;
  threads: Array<Thread>;
  ticketDependencies: Array<TicketDependency>;
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


export type QueryeventArgs = {
  id: Scalars['ID']['input'];
};


export type QuerymessageEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  messageId: Scalars['ID']['input'];
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerymessagesArgs = {
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerysessionArgs = {
  sessionId: Scalars['String']['input'];
};


export type QuerysessionEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  hookEventName?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sessionId: Scalars['String']['input'];
  toolName?: InputMaybe<Scalars['String']['input']>;
};


export type QuerysessionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QuerythreadEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  channelId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  messageId: Scalars['ID']['input'];
  offset?: InputMaybe<Scalars['Int']['input']>;
  threadId: Scalars['ID']['input'];
};


export type QuerythreadsArgs = {
  channelId: Scalars['ID']['input'];
  messageId: Scalars['ID']['input'];
};


export type QueryticketDependenciesArgs = {
  messageId: Scalars['ID']['input'];
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
  messageReadyForReview: MessageReadyForReviewPayload;
  messageUpserted: Message;
  threadEventCreated: ThreadEventPayload;
  threadEventUpdated: ThreadEventPayload;
  ticketReadyToRun: TicketReadyToRunPayload;
  ticketUpserted: TicketUpsertPayload;
};


export type SubscriptionaiChatStreamArgs = {
  chatId: Scalars['ID']['input'];
};


export type SubscriptionmessageDeletedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionmessageReadyForReviewArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionmessageUpsertedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionthreadEventCreatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionthreadEventUpdatedArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionticketReadyToRunArgs = {
  channelId: Scalars['ID']['input'];
};


export type SubscriptionticketUpsertedArgs = {
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

export type TicketDependency = {
  __typename?: 'TicketDependency';
  createdAt: Scalars['DateTime']['output'];
  dependsOnMessageId: Scalars['String']['output'];
  dependsOnTicketTitle?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  ticketMessageId: Scalars['String']['output'];
};

export type TicketMessage = {
  __typename?: 'TicketMessage';
  attachments: Array<TicketAttachment>;
  branch?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  status: Scalars['String']['output'];
};

export type TicketReadyToRunPayload = {
  __typename?: 'TicketReadyToRunPayload';
  channelId: Scalars['String']['output'];
  messageId: Scalars['String']['output'];
  runConfig: Scalars['JSON']['output'];
};

export type TicketUpsertPayload = {
  __typename?: 'TicketUpsertPayload';
  channelId: Scalars['String']['output'];
  columnSlug: Scalars['String']['output'];
  ticket: Ticket;
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
  Channel: ResolverTypeWrapper<ChannelMapper>;
  CreateMessagePayload: ResolverTypeWrapper<CreateMessagePayloadMapper>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  Event: ResolverTypeWrapper<EventMapper>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  EventConnection: ResolverTypeWrapper<EventConnectionMapper>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  KanbanColumn: ResolverTypeWrapper<KanbanColumnMapper>;
  Message: ResolverTypeWrapper<MessageMapper>;
  MessageConnection: ResolverTypeWrapper<MessageConnectionMapper>;
  MessageDeletedPayload: ResolverTypeWrapper<MessageDeletedPayloadMapper>;
  MessageReadyForReviewPayload: ResolverTypeWrapper<MessageReadyForReviewPayload>;
  MessageSession: ResolverTypeWrapper<MessageSessionMapper>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Server: ResolverTypeWrapper<ServerMapper>;
  Session: ResolverTypeWrapper<SessionMapper>;
  SessionConnection: ResolverTypeWrapper<SessionConnectionMapper>;
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Thread: ResolverTypeWrapper<ThreadMapper>;
  ThreadEventPayload: ResolverTypeWrapper<ThreadEventPayloadMapper>;
  Ticket: ResolverTypeWrapper<TicketMapper>;
  TicketAttachment: ResolverTypeWrapper<TicketAttachmentMapper>;
  TicketDependency: ResolverTypeWrapper<TicketDependency>;
  TicketMessage: ResolverTypeWrapper<TicketMessageMapper>;
  TicketReadyToRunPayload: ResolverTypeWrapper<TicketReadyToRunPayload>;
  TicketUpsertPayload: ResolverTypeWrapper<TicketUpsertPayloadMapper>;
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
  Channel: ChannelMapper;
  CreateMessagePayload: CreateMessagePayloadMapper;
  DateTime: Scalars['DateTime']['output'];
  Event: EventMapper;
  Boolean: Scalars['Boolean']['output'];
  EventConnection: EventConnectionMapper;
  JSON: Scalars['JSON']['output'];
  KanbanColumn: KanbanColumnMapper;
  Message: MessageMapper;
  MessageConnection: MessageConnectionMapper;
  MessageDeletedPayload: MessageDeletedPayloadMapper;
  MessageReadyForReviewPayload: MessageReadyForReviewPayload;
  MessageSession: MessageSessionMapper;
  Mutation: Record<PropertyKey, never>;
  Query: Record<PropertyKey, never>;
  Server: ServerMapper;
  Session: SessionMapper;
  SessionConnection: SessionConnectionMapper;
  Subscription: Record<PropertyKey, never>;
  Thread: ThreadMapper;
  ThreadEventPayload: ThreadEventPayloadMapper;
  Ticket: TicketMapper;
  TicketAttachment: TicketAttachmentMapper;
  TicketDependency: TicketDependency;
  TicketMessage: TicketMessageMapper;
  TicketReadyToRunPayload: TicketReadyToRunPayload;
  TicketUpsertPayload: TicketUpsertPayloadMapper;
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
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type CreateMessagePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateMessagePayload'] = ResolversParentTypes['CreateMessagePayload']> = {
  event?: Resolver<ResolversTypes['Event'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['Message'], ParentType, ContextType>;
  thread?: Resolver<ResolversTypes['Thread'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type EventResolvers<ContextType = any, ParentType extends ResolversParentTypes['Event'] = ResolversParentTypes['Event']> = {
  hookEventName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  importance?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastAssistantMessage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rawPayload?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  stopHookActive?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  threadId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  toolInput?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  toolName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  toolResponse?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  toolUseId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type EventConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['EventConnection'] = ResolversParentTypes['EventConnection']> = {
  events?: Resolver<Array<ResolversTypes['Event']>, ParentType, ContextType>;
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
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

export type MessageResolvers<ContextType = any, ParentType extends ResolversParentTypes['Message'] = ResolversParentTypes['Message']> = {
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  claudeSessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  importance?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  preview?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  queuedRunConfig?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['MessageSession']>, ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  threadCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type MessageConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['MessageConnection'] = ResolversParentTypes['MessageConnection']> = {
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type MessageDeletedPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['MessageDeletedPayload'] = ResolversParentTypes['MessageDeletedPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MessageReadyForReviewPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['MessageReadyForReviewPayload'] = ResolversParentTypes['MessageReadyForReviewPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  claudeSessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MessageSessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['MessageSession'] = ResolversParentTypes['MessageSession']> = {
  cwd?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  appendPrompt?: Resolver<ResolversTypes['CreateMessagePayload'], ParentType, ContextType, RequireFields<MutationappendPromptArgs, 'channelId' | 'messageId' | 'text'>>;
  createAiChat?: Resolver<ResolversTypes['AiChat'], ParentType, ContextType, RequireFields<MutationcreateAiChatArgs, 'serverId'>>;
  createChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationcreateChannelArgs, 'name'>>;
  createColumn?: Resolver<ResolversTypes['KanbanColumn'], ParentType, ContextType, RequireFields<MutationcreateColumnArgs, 'channelId' | 'name' | 'slug'>>;
  createMessage?: Resolver<ResolversTypes['CreateMessagePayload'], ParentType, ContextType, RequireFields<MutationcreateMessageArgs, 'channelId' | 'text'>>;
  createServer?: Resolver<ResolversTypes['Server'], ParentType, ContextType, RequireFields<MutationcreateServerArgs, 'name'>>;
  createThread?: Resolver<ResolversTypes['Thread'], ParentType, ContextType, RequireFields<MutationcreateThreadArgs, 'channelId' | 'messageId'>>;
  deleteAiChat?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteAiChatArgs, 'id'>>;
  deleteColumn?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteColumnArgs, 'columnId'>>;
  deleteMessage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationdeleteMessageArgs, 'channelId' | 'messageId'>>;
  moveTicket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType, RequireFields<MutationmoveTicketArgs, 'columnId' | 'ticketId'>>;
  removeTicketDependency?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationremoveTicketDependencyArgs, 'channelId' | 'dependsOnMessageId' | 'messageId'>>;
  renameAiChat?: Resolver<ResolversTypes['AiChat'], ParentType, ContextType, RequireFields<MutationrenameAiChatArgs, 'id' | 'title'>>;
  sendAiChatMessage?: Resolver<ResolversTypes['AiChatMessage'], ParentType, ContextType, RequireFields<MutationsendAiChatMessageArgs, 'chatId' | 'content'>>;
  setTicketDependencies?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationsetTicketDependenciesArgs, 'channelId' | 'dependsOnMessageIds' | 'messageId' | 'runConfig'>>;
  updateChannel?: Resolver<ResolversTypes['Channel'], ParentType, ContextType, RequireFields<MutationupdateChannelArgs, 'id'>>;
  updateColumn?: Resolver<ResolversTypes['KanbanColumn'], ParentType, ContextType, RequireFields<MutationupdateColumnArgs, 'columnId'>>;
  updateMessagePreview?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationupdateMessagePreviewArgs, 'channelId' | 'messageId' | 'preview'>>;
  updateMessageStatus?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<MutationupdateMessageStatusArgs, 'channelId' | 'messageId' | 'status'>>;
  updateQueuedRunConfig?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationupdateQueuedRunConfigArgs, 'messageId' | 'runConfig'>>;
  uploadAttachment?: Resolver<ResolversTypes['Attachment'], ParentType, ContextType, RequireFields<MutationuploadAttachmentArgs, 'contentType' | 'data' | 'filename'>>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  aiChatMessages?: Resolver<ResolversTypes['AiChatMessageConnection'], ParentType, ContextType, RequireFields<QueryaiChatMessagesArgs, 'chatId'>>;
  aiChats?: Resolver<Array<ResolversTypes['AiChat']>, ParentType, ContextType, RequireFields<QueryaiChatsArgs, 'serverId'>>;
  board?: Resolver<Array<ResolversTypes['KanbanColumn']>, ParentType, ContextType, RequireFields<QueryboardArgs, 'channelId'>>;
  channel?: Resolver<Maybe<ResolversTypes['Channel']>, ParentType, ContextType, RequireFields<QuerychannelArgs, 'id'>>;
  channels?: Resolver<Array<ResolversTypes['Channel']>, ParentType, ContextType>;
  event?: Resolver<Maybe<ResolversTypes['Event']>, ParentType, ContextType, RequireFields<QueryeventArgs, 'id'>>;
  messageEvents?: Resolver<ResolversTypes['EventConnection'], ParentType, ContextType, RequireFields<QuerymessageEventsArgs, 'channelId' | 'messageId'>>;
  messages?: Resolver<ResolversTypes['MessageConnection'], ParentType, ContextType, RequireFields<QuerymessagesArgs, 'channelId'>>;
  servers?: Resolver<Array<ResolversTypes['Server']>, ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType, RequireFields<QuerysessionArgs, 'sessionId'>>;
  sessionEvents?: Resolver<ResolversTypes['EventConnection'], ParentType, ContextType, RequireFields<QuerysessionEventsArgs, 'sessionId'>>;
  sessions?: Resolver<ResolversTypes['SessionConnection'], ParentType, ContextType, Partial<QuerysessionsArgs>>;
  threadEvents?: Resolver<ResolversTypes['EventConnection'], ParentType, ContextType, RequireFields<QuerythreadEventsArgs, 'channelId' | 'messageId' | 'threadId'>>;
  threads?: Resolver<Array<ResolversTypes['Thread']>, ParentType, ContextType, RequireFields<QuerythreadsArgs, 'channelId' | 'messageId'>>;
  ticketDependencies?: Resolver<Array<ResolversTypes['TicketDependency']>, ParentType, ContextType, RequireFields<QueryticketDependenciesArgs, 'messageId'>>;
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

export type SessionConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['SessionConnection'] = ResolversParentTypes['SessionConnection']> = {
  limit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  offset?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sessions?: Resolver<Array<ResolversTypes['Session']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type SubscriptionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  aiChatStream?: SubscriptionResolver<ResolversTypes['AiChatStreamPayload'], "aiChatStream", ParentType, ContextType, RequireFields<SubscriptionaiChatStreamArgs, 'chatId'>>;
  messageDeleted?: SubscriptionResolver<ResolversTypes['MessageDeletedPayload'], "messageDeleted", ParentType, ContextType, RequireFields<SubscriptionmessageDeletedArgs, 'channelId'>>;
  messageReadyForReview?: SubscriptionResolver<ResolversTypes['MessageReadyForReviewPayload'], "messageReadyForReview", ParentType, ContextType, RequireFields<SubscriptionmessageReadyForReviewArgs, 'channelId'>>;
  messageUpserted?: SubscriptionResolver<ResolversTypes['Message'], "messageUpserted", ParentType, ContextType, RequireFields<SubscriptionmessageUpsertedArgs, 'channelId'>>;
  threadEventCreated?: SubscriptionResolver<ResolversTypes['ThreadEventPayload'], "threadEventCreated", ParentType, ContextType, RequireFields<SubscriptionthreadEventCreatedArgs, 'channelId'>>;
  threadEventUpdated?: SubscriptionResolver<ResolversTypes['ThreadEventPayload'], "threadEventUpdated", ParentType, ContextType, RequireFields<SubscriptionthreadEventUpdatedArgs, 'channelId'>>;
  ticketReadyToRun?: SubscriptionResolver<ResolversTypes['TicketReadyToRunPayload'], "ticketReadyToRun", ParentType, ContextType, RequireFields<SubscriptionticketReadyToRunArgs, 'channelId'>>;
  ticketUpserted?: SubscriptionResolver<ResolversTypes['TicketUpsertPayload'], "ticketUpserted", ParentType, ContextType, RequireFields<SubscriptionticketUpsertedArgs, 'channelId'>>;
};

export type ThreadResolvers<ContextType = any, ParentType extends ResolversParentTypes['Thread'] = ResolversParentTypes['Thread']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  eventCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ThreadEventPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['ThreadEventPayload'] = ResolversParentTypes['ThreadEventPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  event?: Resolver<ResolversTypes['Event'], ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  threadId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketResolvers<ContextType = any, ParentType extends ResolversParentTypes['Ticket'] = ResolversParentTypes['Ticket']> = {
  columnId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['TicketMessage']>, ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  solutionApproach?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sortOrder?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
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
  dependsOnMessageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  dependsOnTicketTitle?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ticketMessageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketMessageResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketMessage'] = ResolversParentTypes['TicketMessage']> = {
  attachments?: Resolver<Array<ResolversTypes['TicketAttachment']>, ParentType, ContextType>;
  branch?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TicketReadyToRunPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketReadyToRunPayload'] = ResolversParentTypes['TicketReadyToRunPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  runConfig?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
};

export type TicketUpsertPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['TicketUpsertPayload'] = ResolversParentTypes['TicketUpsertPayload']> = {
  channelId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  columnSlug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ticket?: Resolver<ResolversTypes['Ticket'], ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  AiChat?: AiChatResolvers<ContextType>;
  AiChatMessage?: AiChatMessageResolvers<ContextType>;
  AiChatMessageConnection?: AiChatMessageConnectionResolvers<ContextType>;
  AiChatStreamPayload?: AiChatStreamPayloadResolvers<ContextType>;
  Attachment?: AttachmentResolvers<ContextType>;
  Channel?: ChannelResolvers<ContextType>;
  CreateMessagePayload?: CreateMessagePayloadResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  Event?: EventResolvers<ContextType>;
  EventConnection?: EventConnectionResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  KanbanColumn?: KanbanColumnResolvers<ContextType>;
  Message?: MessageResolvers<ContextType>;
  MessageConnection?: MessageConnectionResolvers<ContextType>;
  MessageDeletedPayload?: MessageDeletedPayloadResolvers<ContextType>;
  MessageReadyForReviewPayload?: MessageReadyForReviewPayloadResolvers<ContextType>;
  MessageSession?: MessageSessionResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Server?: ServerResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  SessionConnection?: SessionConnectionResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Thread?: ThreadResolvers<ContextType>;
  ThreadEventPayload?: ThreadEventPayloadResolvers<ContextType>;
  Ticket?: TicketResolvers<ContextType>;
  TicketAttachment?: TicketAttachmentResolvers<ContextType>;
  TicketDependency?: TicketDependencyResolvers<ContextType>;
  TicketMessage?: TicketMessageResolvers<ContextType>;
  TicketReadyToRunPayload?: TicketReadyToRunPayloadResolvers<ContextType>;
  TicketUpsertPayload?: TicketUpsertPayloadResolvers<ContextType>;
};

