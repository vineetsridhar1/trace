/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { aiChatMessages as Query_aiChatMessages } from './aiChat/resolvers/Query/aiChatMessages';
import    { aiChats as Query_aiChats } from './aiChat/resolvers/Query/aiChats';
import    { board as Query_board } from './kanban/resolvers/Query/board';
import    { channel as Query_channel } from './channel/resolvers/Query/channel';
import    { channels as Query_channels } from './channel/resolvers/Query/channels';
import    { event as Query_event } from './event/resolvers/Query/event';
import    { messageEvents as Query_messageEvents } from './thread/resolvers/Query/messageEvents';
import    { messages as Query_messages } from './message/resolvers/Query/messages';
import    { servers as Query_servers } from './server/resolvers/Query/servers';
import    { session as Query_session } from './session/resolvers/Query/session';
import    { sessionEvents as Query_sessionEvents } from './session/resolvers/Query/sessionEvents';
import    { sessions as Query_sessions } from './session/resolvers/Query/sessions';
import    { threadEvents as Query_threadEvents } from './thread/resolvers/Query/threadEvents';
import    { threads as Query_threads } from './thread/resolvers/Query/threads';
import    { ticketDependencies as Query_ticketDependencies } from './kanban/resolvers/Query/ticketDependencies';
import    { appendPrompt as Mutation_appendPrompt } from './message/resolvers/Mutation/appendPrompt';
import    { createAiChat as Mutation_createAiChat } from './aiChat/resolvers/Mutation/createAiChat';
import    { createChannel as Mutation_createChannel } from './channel/resolvers/Mutation/createChannel';
import    { createColumn as Mutation_createColumn } from './kanban/resolvers/Mutation/createColumn';
import    { createMessage as Mutation_createMessage } from './message/resolvers/Mutation/createMessage';
import    { createServer as Mutation_createServer } from './server/resolvers/Mutation/createServer';
import    { createThread as Mutation_createThread } from './thread/resolvers/Mutation/createThread';
import    { deleteAiChat as Mutation_deleteAiChat } from './aiChat/resolvers/Mutation/deleteAiChat';
import    { deleteColumn as Mutation_deleteColumn } from './kanban/resolvers/Mutation/deleteColumn';
import    { deleteMessage as Mutation_deleteMessage } from './message/resolvers/Mutation/deleteMessage';
import    { moveTicket as Mutation_moveTicket } from './kanban/resolvers/Mutation/moveTicket';
import    { removeTicketDependency as Mutation_removeTicketDependency } from './kanban/resolvers/Mutation/removeTicketDependency';
import    { renameAiChat as Mutation_renameAiChat } from './aiChat/resolvers/Mutation/renameAiChat';
import    { sendAiChatMessage as Mutation_sendAiChatMessage } from './aiChat/resolvers/Mutation/sendAiChatMessage';
import    { setTicketDependencies as Mutation_setTicketDependencies } from './kanban/resolvers/Mutation/setTicketDependencies';
import    { updateChannel as Mutation_updateChannel } from './channel/resolvers/Mutation/updateChannel';
import    { updateColumn as Mutation_updateColumn } from './kanban/resolvers/Mutation/updateColumn';
import    { updateMessagePreview as Mutation_updateMessagePreview } from './message/resolvers/Mutation/updateMessagePreview';
import    { updateMessageStatus as Mutation_updateMessageStatus } from './message/resolvers/Mutation/updateMessageStatus';
import    { uploadAttachment as Mutation_uploadAttachment } from './attachment/resolvers/Mutation/uploadAttachment';
import    { aiChatStream as Subscription_aiChatStream } from './aiChat/resolvers/Subscription/aiChatStream';
import    { messageDeleted as Subscription_messageDeleted } from './message/resolvers/Subscription/messageDeleted';
import    { messageReadyForReview as Subscription_messageReadyForReview } from './message/resolvers/Subscription/messageReadyForReview';
import    { messageUpserted as Subscription_messageUpserted } from './message/resolvers/Subscription/messageUpserted';
import    { threadEventCreated as Subscription_threadEventCreated } from './event/resolvers/Subscription/threadEventCreated';
import    { threadEventUpdated as Subscription_threadEventUpdated } from './event/resolvers/Subscription/threadEventUpdated';
import    { ticketReadyToRun as Subscription_ticketReadyToRun } from './kanban/resolvers/Subscription/ticketReadyToRun';
import    { ticketUpserted as Subscription_ticketUpserted } from './kanban/resolvers/Subscription/ticketUpserted';
import    { AiChat } from './aiChat/resolvers/AiChat';
import    { AiChatMessage } from './aiChat/resolvers/AiChatMessage';
import    { AiChatMessageConnection } from './aiChat/resolvers/AiChatMessageConnection';
import    { AiChatStreamPayload } from './aiChat/resolvers/AiChatStreamPayload';
import    { Attachment } from './attachment/resolvers/Attachment';
import    { Channel } from './channel/resolvers/Channel';
import    { CreateMessagePayload } from './message/resolvers/CreateMessagePayload';
import    { Event } from './event/resolvers/Event';
import    { EventConnection } from './event/resolvers/EventConnection';
import    { KanbanColumn } from './kanban/resolvers/KanbanColumn';
import    { Message } from './message/resolvers/Message';
import    { MessageConnection } from './message/resolvers/MessageConnection';
import    { MessageDeletedPayload } from './message/resolvers/MessageDeletedPayload';
import    { MessageReadyForReviewPayload } from './message/resolvers/MessageReadyForReviewPayload';
import    { MessageSession } from './message/resolvers/MessageSession';
import    { Server } from './server/resolvers/Server';
import    { Session } from './session/resolvers/Session';
import    { SessionConnection } from './session/resolvers/SessionConnection';
import    { Thread } from './thread/resolvers/Thread';
import    { ThreadEventPayload } from './event/resolvers/ThreadEventPayload';
import    { Ticket } from './kanban/resolvers/Ticket';
import    { TicketAttachment } from './kanban/resolvers/TicketAttachment';
import    { TicketDependency } from './kanban/resolvers/TicketDependency';
import    { TicketMessage } from './kanban/resolvers/TicketMessage';
import    { TicketReadyToRunPayload } from './kanban/resolvers/TicketReadyToRunPayload';
import    { TicketUpsertPayload } from './kanban/resolvers/TicketUpsertPayload';
import    { DateTime } from './base/resolvers/DateTime';
import    { JSON } from './base/resolvers/JSON';
    export const resolvers: Resolvers = {
      Query: { aiChatMessages: Query_aiChatMessages,aiChats: Query_aiChats,board: Query_board,channel: Query_channel,channels: Query_channels,event: Query_event,messageEvents: Query_messageEvents,messages: Query_messages,servers: Query_servers,session: Query_session,sessionEvents: Query_sessionEvents,sessions: Query_sessions,threadEvents: Query_threadEvents,threads: Query_threads,ticketDependencies: Query_ticketDependencies },
      Mutation: { appendPrompt: Mutation_appendPrompt,createAiChat: Mutation_createAiChat,createChannel: Mutation_createChannel,createColumn: Mutation_createColumn,createMessage: Mutation_createMessage,createServer: Mutation_createServer,createThread: Mutation_createThread,deleteAiChat: Mutation_deleteAiChat,deleteColumn: Mutation_deleteColumn,deleteMessage: Mutation_deleteMessage,moveTicket: Mutation_moveTicket,removeTicketDependency: Mutation_removeTicketDependency,renameAiChat: Mutation_renameAiChat,sendAiChatMessage: Mutation_sendAiChatMessage,setTicketDependencies: Mutation_setTicketDependencies,updateChannel: Mutation_updateChannel,updateColumn: Mutation_updateColumn,updateMessagePreview: Mutation_updateMessagePreview,updateMessageStatus: Mutation_updateMessageStatus,uploadAttachment: Mutation_uploadAttachment },
      Subscription: { aiChatStream: Subscription_aiChatStream,messageDeleted: Subscription_messageDeleted,messageReadyForReview: Subscription_messageReadyForReview,messageUpserted: Subscription_messageUpserted,threadEventCreated: Subscription_threadEventCreated,threadEventUpdated: Subscription_threadEventUpdated,ticketReadyToRun: Subscription_ticketReadyToRun,ticketUpserted: Subscription_ticketUpserted },
      AiChat: AiChat,
AiChatMessage: AiChatMessage,
AiChatMessageConnection: AiChatMessageConnection,
AiChatStreamPayload: AiChatStreamPayload,
Attachment: Attachment,
Channel: Channel,
CreateMessagePayload: CreateMessagePayload,
Event: Event,
EventConnection: EventConnection,
KanbanColumn: KanbanColumn,
Message: Message,
MessageConnection: MessageConnection,
MessageDeletedPayload: MessageDeletedPayload,
MessageReadyForReviewPayload: MessageReadyForReviewPayload,
MessageSession: MessageSession,
Server: Server,
Session: Session,
SessionConnection: SessionConnection,
Thread: Thread,
ThreadEventPayload: ThreadEventPayload,
Ticket: Ticket,
TicketAttachment: TicketAttachment,
TicketDependency: TicketDependency,
TicketMessage: TicketMessage,
TicketReadyToRunPayload: TicketReadyToRunPayload,
TicketUpsertPayload: TicketUpsertPayload,
DateTime: DateTime,
JSON: JSON
    }