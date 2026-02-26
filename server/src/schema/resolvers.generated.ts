/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { board as Query_board } from './kanban/resolvers/Query/board';
import    { channel as Query_channel } from './channel/resolvers/Query/channel';
import    { channels as Query_channels } from './channel/resolvers/Query/channels';
import    { event as Query_event } from './event/resolvers/Query/event';
import    { messageEvents as Query_messageEvents } from './thread/resolvers/Query/messageEvents';
import    { messages as Query_messages } from './message/resolvers/Query/messages';
import    { repoBranches as Query_repoBranches } from './channel/resolvers/Query/repoBranches';
import    { servers as Query_servers } from './server/resolvers/Query/servers';
import    { session as Query_session } from './session/resolvers/Query/session';
import    { sessionEvents as Query_sessionEvents } from './session/resolvers/Query/sessionEvents';
import    { sessions as Query_sessions } from './session/resolvers/Query/sessions';
import    { threadEvents as Query_threadEvents } from './thread/resolvers/Query/threadEvents';
import    { threads as Query_threads } from './thread/resolvers/Query/threads';
import    { validateRepo as Query_validateRepo } from './channel/resolvers/Query/validateRepo';
import    { appendPrompt as Mutation_appendPrompt } from './message/resolvers/Mutation/appendPrompt';
import    { createChannel as Mutation_createChannel } from './channel/resolvers/Mutation/createChannel';
import    { createColumn as Mutation_createColumn } from './kanban/resolvers/Mutation/createColumn';
import    { createMessage as Mutation_createMessage } from './message/resolvers/Mutation/createMessage';
import    { createServer as Mutation_createServer } from './server/resolvers/Mutation/createServer';
import    { deleteColumn as Mutation_deleteColumn } from './kanban/resolvers/Mutation/deleteColumn';
import    { moveTicket as Mutation_moveTicket } from './kanban/resolvers/Mutation/moveTicket';
import    { updateChannel as Mutation_updateChannel } from './channel/resolvers/Mutation/updateChannel';
import    { updateColumn as Mutation_updateColumn } from './kanban/resolvers/Mutation/updateColumn';
import    { updateMessagePreview as Mutation_updateMessagePreview } from './message/resolvers/Mutation/updateMessagePreview';
import    { updateMessageStatus as Mutation_updateMessageStatus } from './message/resolvers/Mutation/updateMessageStatus';
import    { uploadAttachment as Mutation_uploadAttachment } from './attachment/resolvers/Mutation/uploadAttachment';
import    { Attachment } from './attachment/resolvers/Attachment';
import    { Channel } from './channel/resolvers/Channel';
import    { CreateMessagePayload } from './message/resolvers/CreateMessagePayload';
import    { Event } from './event/resolvers/Event';
import    { EventConnection } from './event/resolvers/EventConnection';
import    { KanbanColumn } from './kanban/resolvers/KanbanColumn';
import    { Message } from './message/resolvers/Message';
import    { MessageConnection } from './message/resolvers/MessageConnection';
import    { MessageSession } from './message/resolvers/MessageSession';
import    { RepoValidation } from './channel/resolvers/RepoValidation';
import    { Server } from './server/resolvers/Server';
import    { Session } from './session/resolvers/Session';
import    { SessionConnection } from './session/resolvers/SessionConnection';
import    { Thread } from './thread/resolvers/Thread';
import    { Ticket } from './kanban/resolvers/Ticket';
import    { TicketAttachment } from './kanban/resolvers/TicketAttachment';
import    { TicketMessage } from './kanban/resolvers/TicketMessage';
import    { DateTime } from './base/resolvers/DateTime';
import    { JSON } from './base/resolvers/JSON';
    export const resolvers: Resolvers = {
      Query: { board: Query_board,channel: Query_channel,channels: Query_channels,event: Query_event,messageEvents: Query_messageEvents,messages: Query_messages,repoBranches: Query_repoBranches,servers: Query_servers,session: Query_session,sessionEvents: Query_sessionEvents,sessions: Query_sessions,threadEvents: Query_threadEvents,threads: Query_threads,validateRepo: Query_validateRepo },
      Mutation: { appendPrompt: Mutation_appendPrompt,createChannel: Mutation_createChannel,createColumn: Mutation_createColumn,createMessage: Mutation_createMessage,createServer: Mutation_createServer,deleteColumn: Mutation_deleteColumn,moveTicket: Mutation_moveTicket,updateChannel: Mutation_updateChannel,updateColumn: Mutation_updateColumn,updateMessagePreview: Mutation_updateMessagePreview,updateMessageStatus: Mutation_updateMessageStatus,uploadAttachment: Mutation_uploadAttachment },
      
      Attachment: Attachment,
Channel: Channel,
CreateMessagePayload: CreateMessagePayload,
Event: Event,
EventConnection: EventConnection,
KanbanColumn: KanbanColumn,
Message: Message,
MessageConnection: MessageConnection,
MessageSession: MessageSession,
RepoValidation: RepoValidation,
Server: Server,
Session: Session,
SessionConnection: SessionConnection,
Thread: Thread,
Ticket: Ticket,
TicketAttachment: TicketAttachment,
TicketMessage: TicketMessage,
DateTime: DateTime,
JSON: JSON
    }