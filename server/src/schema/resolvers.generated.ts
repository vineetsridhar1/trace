/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { aiChatMessages as Query_aiChatMessages } from './aiChat/resolvers/Query/aiChatMessages';
import    { aiChats as Query_aiChats } from './aiChat/resolvers/Query/aiChats';
import    { board as Query_board } from './kanban/resolvers/Query/board';
import    { channel as Query_channel } from './channel/resolvers/Query/channel';
import    { channelMessages as Query_channelMessages } from './channelMessage/resolvers/Query/channelMessages';
import    { channels as Query_channels } from './channel/resolvers/Query/channels';
import    { checkPRStatuses as Query_checkPRStatuses } from './workspace/resolvers/Query/checkPRStatuses';
import    { event as Query_event } from './event/resolvers/Query/event';
import    { generateBranchName as Query_generateBranchName } from './workspace/resolvers/Query/generateBranchName';
import    { me as Query_me } from './auth/resolvers/Query/me';
import    { servers as Query_servers } from './server/resolvers/Query/servers';
import    { sessionEvents as Query_sessionEvents } from './session/resolvers/Query/sessionEvents';
import    { sessions as Query_sessions } from './session/resolvers/Query/sessions';
import    { ticketDependencies as Query_ticketDependencies } from './kanban/resolvers/Query/ticketDependencies';
import    { workspace as Query_workspace } from './workspace/resolvers/Query/workspace';
import    { workspaceEvents as Query_workspaceEvents } from './session/resolvers/Query/workspaceEvents';
import    { workspaces as Query_workspaces } from './workspace/resolvers/Query/workspaces';
import    { appendPrompt as Mutation_appendPrompt } from './workspace/resolvers/Mutation/appendPrompt';
import    { createAiChat as Mutation_createAiChat } from './aiChat/resolvers/Mutation/createAiChat';
import    { createChannel as Mutation_createChannel } from './channel/resolvers/Mutation/createChannel';
import    { createColumn as Mutation_createColumn } from './kanban/resolvers/Mutation/createColumn';
import    { createServer as Mutation_createServer } from './server/resolvers/Mutation/createServer';
import    { createSession as Mutation_createSession } from './session/resolvers/Mutation/createSession';
import    { createWorkspace as Mutation_createWorkspace } from './workspace/resolvers/Mutation/createWorkspace';
import    { deleteAiChat as Mutation_deleteAiChat } from './aiChat/resolvers/Mutation/deleteAiChat';
import    { deleteChannel as Mutation_deleteChannel } from './channel/resolvers/Mutation/deleteChannel';
import    { deleteColumn as Mutation_deleteColumn } from './kanban/resolvers/Mutation/deleteColumn';
import    { deleteWorkspace as Mutation_deleteWorkspace } from './workspace/resolvers/Mutation/deleteWorkspace';
import    { handoffWorkspace as Mutation_handoffWorkspace } from './workspace/resolvers/Mutation/handoffWorkspace';
import    { moveTicket as Mutation_moveTicket } from './kanban/resolvers/Mutation/moveTicket';
import    { removeTicketDependency as Mutation_removeTicketDependency } from './kanban/resolvers/Mutation/removeTicketDependency';
import    { renameAiChat as Mutation_renameAiChat } from './aiChat/resolvers/Mutation/renameAiChat';
import    { sendAiChatMessage as Mutation_sendAiChatMessage } from './aiChat/resolvers/Mutation/sendAiChatMessage';
import    { sendChannelMessage as Mutation_sendChannelMessage } from './channelMessage/resolvers/Mutation/sendChannelMessage';
import    { setTicketDependencies as Mutation_setTicketDependencies } from './kanban/resolvers/Mutation/setTicketDependencies';
import    { setWorkspacePrUrl as Mutation_setWorkspacePrUrl } from './workspace/resolvers/Mutation/setWorkspacePrUrl';
import    { updateChannel as Mutation_updateChannel } from './channel/resolvers/Mutation/updateChannel';
import    { updateColumn as Mutation_updateColumn } from './kanban/resolvers/Mutation/updateColumn';
import    { updateQueuedRunConfig as Mutation_updateQueuedRunConfig } from './kanban/resolvers/Mutation/updateQueuedRunConfig';
import    { updateWorkspacePreview as Mutation_updateWorkspacePreview } from './workspace/resolvers/Mutation/updateWorkspacePreview';
import    { updateWorkspaceStatus as Mutation_updateWorkspaceStatus } from './workspace/resolvers/Mutation/updateWorkspaceStatus';
import    { uploadAttachment as Mutation_uploadAttachment } from './attachment/resolvers/Mutation/uploadAttachment';
import    { aiChatStream as Subscription_aiChatStream } from './aiChat/resolvers/Subscription/aiChatStream';
import    { channelChangedInServer as Subscription_channelChangedInServer } from './channel/resolvers/Subscription/channelChangedInServer';
import    { channelMessageCreated as Subscription_channelMessageCreated } from './channelMessage/resolvers/Subscription/channelMessageCreated';
import    { channelMessageCreatedInServer as Subscription_channelMessageCreatedInServer } from './channelMessage/resolvers/Subscription/channelMessageCreatedInServer';
import    { sessionEventCreated as Subscription_sessionEventCreated } from './event/resolvers/Subscription/sessionEventCreated';
import    { sessionEventUpdated as Subscription_sessionEventUpdated } from './event/resolvers/Subscription/sessionEventUpdated';
import    { ticketReadyToRun as Subscription_ticketReadyToRun } from './kanban/resolvers/Subscription/ticketReadyToRun';
import    { ticketUpserted as Subscription_ticketUpserted } from './kanban/resolvers/Subscription/ticketUpserted';
import    { workspaceDeleted as Subscription_workspaceDeleted } from './workspace/resolvers/Subscription/workspaceDeleted';
import    { workspaceUpserted as Subscription_workspaceUpserted } from './workspace/resolvers/Subscription/workspaceUpserted';
import    { AiChat } from './aiChat/resolvers/AiChat';
import    { AiChatMessage } from './aiChat/resolvers/AiChatMessage';
import    { AiChatMessageConnection } from './aiChat/resolvers/AiChatMessageConnection';
import    { AiChatStreamPayload } from './aiChat/resolvers/AiChatStreamPayload';
import    { Attachment } from './attachment/resolvers/Attachment';
import    { AuthUser } from './auth/resolvers/AuthUser';
import    { Channel } from './channel/resolvers/Channel';
import    { ChannelChangeEvent } from './channel/resolvers/ChannelChangeEvent';
import    { ChannelMessage } from './channelMessage/resolvers/ChannelMessage';
import    { ChannelMessageAuthor } from './channelMessage/resolvers/ChannelMessageAuthor';
import    { ChannelMessageConnection } from './channelMessage/resolvers/ChannelMessageConnection';
import    { CliSession } from './cli-session/resolvers/CliSession';
import    { CliSessionConnection } from './cli-session/resolvers/CliSessionConnection';
import    { CreateWorkspacePayload } from './workspace/resolvers/CreateWorkspacePayload';
import    { Event } from './event/resolvers/Event';
import    { EventConnection } from './event/resolvers/EventConnection';
import    { KanbanColumn } from './kanban/resolvers/KanbanColumn';
import    { PRStatus } from './workspace/resolvers/PRStatus';
import    { Server } from './server/resolvers/Server';
import    { Session } from './session/resolvers/Session';
import    { SessionEventPayload } from './event/resolvers/SessionEventPayload';
import    { Ticket } from './kanban/resolvers/Ticket';
import    { TicketAttachment } from './kanban/resolvers/TicketAttachment';
import    { TicketDependency } from './kanban/resolvers/TicketDependency';
import    { TicketReadyToRunPayload } from './kanban/resolvers/TicketReadyToRunPayload';
import    { TicketUpsertPayload } from './kanban/resolvers/TicketUpsertPayload';
import    { TicketWorkspace } from './kanban/resolvers/TicketWorkspace';
import    { TokenUsage } from './event/resolvers/TokenUsage';
import    { Workspace } from './workspace/resolvers/Workspace';
import    { WorkspaceCliSession } from './workspace/resolvers/WorkspaceCliSession';
import    { WorkspaceConnection } from './workspace/resolvers/WorkspaceConnection';
import    { WorkspaceDeletedPayload } from './workspace/resolvers/WorkspaceDeletedPayload';
import    { WorkspaceUser } from './workspace/resolvers/WorkspaceUser';
import    { DateTime } from './base/resolvers/DateTime';
import    { JSON } from './base/resolvers/JSON';
    export const resolvers: Resolvers = {
      Query: { aiChatMessages: Query_aiChatMessages,aiChats: Query_aiChats,board: Query_board,channel: Query_channel,channelMessages: Query_channelMessages,channels: Query_channels,checkPRStatuses: Query_checkPRStatuses,event: Query_event,generateBranchName: Query_generateBranchName,me: Query_me,servers: Query_servers,sessionEvents: Query_sessionEvents,sessions: Query_sessions,ticketDependencies: Query_ticketDependencies,workspace: Query_workspace,workspaceEvents: Query_workspaceEvents,workspaces: Query_workspaces },
      Mutation: { appendPrompt: Mutation_appendPrompt,createAiChat: Mutation_createAiChat,createChannel: Mutation_createChannel,createColumn: Mutation_createColumn,createServer: Mutation_createServer,createSession: Mutation_createSession,createWorkspace: Mutation_createWorkspace,deleteAiChat: Mutation_deleteAiChat,deleteChannel: Mutation_deleteChannel,deleteColumn: Mutation_deleteColumn,deleteWorkspace: Mutation_deleteWorkspace,handoffWorkspace: Mutation_handoffWorkspace,moveTicket: Mutation_moveTicket,removeTicketDependency: Mutation_removeTicketDependency,renameAiChat: Mutation_renameAiChat,sendAiChatMessage: Mutation_sendAiChatMessage,sendChannelMessage: Mutation_sendChannelMessage,setTicketDependencies: Mutation_setTicketDependencies,setWorkspacePrUrl: Mutation_setWorkspacePrUrl,updateChannel: Mutation_updateChannel,updateColumn: Mutation_updateColumn,updateQueuedRunConfig: Mutation_updateQueuedRunConfig,updateWorkspacePreview: Mutation_updateWorkspacePreview,updateWorkspaceStatus: Mutation_updateWorkspaceStatus,uploadAttachment: Mutation_uploadAttachment },
      Subscription: { aiChatStream: Subscription_aiChatStream,channelChangedInServer: Subscription_channelChangedInServer,channelMessageCreated: Subscription_channelMessageCreated,channelMessageCreatedInServer: Subscription_channelMessageCreatedInServer,sessionEventCreated: Subscription_sessionEventCreated,sessionEventUpdated: Subscription_sessionEventUpdated,ticketReadyToRun: Subscription_ticketReadyToRun,ticketUpserted: Subscription_ticketUpserted,workspaceDeleted: Subscription_workspaceDeleted,workspaceUpserted: Subscription_workspaceUpserted },
      AiChat: AiChat,
AiChatMessage: AiChatMessage,
AiChatMessageConnection: AiChatMessageConnection,
AiChatStreamPayload: AiChatStreamPayload,
Attachment: Attachment,
AuthUser: AuthUser,
Channel: Channel,
ChannelChangeEvent: ChannelChangeEvent,
ChannelMessage: ChannelMessage,
ChannelMessageAuthor: ChannelMessageAuthor,
ChannelMessageConnection: ChannelMessageConnection,
CliSession: CliSession,
CliSessionConnection: CliSessionConnection,
CreateWorkspacePayload: CreateWorkspacePayload,
Event: Event,
EventConnection: EventConnection,
KanbanColumn: KanbanColumn,
PRStatus: PRStatus,
Server: Server,
Session: Session,
SessionEventPayload: SessionEventPayload,
Ticket: Ticket,
TicketAttachment: TicketAttachment,
TicketDependency: TicketDependency,
TicketReadyToRunPayload: TicketReadyToRunPayload,
TicketUpsertPayload: TicketUpsertPayload,
TicketWorkspace: TicketWorkspace,
TokenUsage: TokenUsage,
Workspace: Workspace,
WorkspaceCliSession: WorkspaceCliSession,
WorkspaceConnection: WorkspaceConnection,
WorkspaceDeletedPayload: WorkspaceDeletedPayload,
WorkspaceUser: WorkspaceUser,
DateTime: DateTime,
JSON: JSON
    }