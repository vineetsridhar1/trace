export interface KanbanColumnMapper {
  id: string;
  channelId: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
  tickets?: TicketMapper[];
}

export interface TicketMapper {
  id: string;
  workspaceId: string | null;
  columnId: string;
  title: string;
  description: string | null;
  solutionApproach: string | null;
  status: string;
  metadata: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  workspace: TicketWorkspaceMapper | null;
}

export interface TicketWorkspaceMapper {
  id: string;
  userId: string | null;
  branch: string | null;
  prUrl: string | null;
  status: string;
  createdAt: Date;
  attachments: TicketAttachmentMapper[];
}

export interface TicketAttachmentMapper {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  url?: string;
}

export interface TicketUpsertPayloadMapper {
  channelId: string;
  ticket: TicketMapper;
  columnSlug: string;
}

export interface ImportedTicketResultMapper {
  ticketJsonId: string;
  workspaceId: string;
  ticketId: string;
}
