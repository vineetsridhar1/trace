export interface KanbanColumnMapper {
  id: string;
  channelId: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
  tickets: TicketMapper[];
}

export interface TicketMapper {
  id: string;
  messageId: string;
  columnId: string;
  title: string;
  description: string | null;
  solutionApproach: string | null;
  status: string;
  metadata: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  message: TicketMessageMapper;
}

export interface TicketMessageMapper {
  id: string;
  branch: string | null;
  status: string;
  createdAt: Date;
  attachments: TicketAttachmentMapper[];
}

export interface TicketAttachmentMapper {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  url: string;
}
