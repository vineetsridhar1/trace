import prisma from '../lib/prisma';
import { sseManager } from './sseManager';
import { generateTicketFromMessage, updateTicketFromContext } from './ticketAiService';
import { getStorage } from './storageService';

function resolveTicketAttachmentUrls<T extends { message: { attachments: { id: string; key: string; filename: string; contentType: string }[] } }>(ticket: T) {
  const storage = getStorage();
  return {
    ...ticket,
    message: {
      ...ticket.message,
      attachments: ticket.message.attachments.map((a) => ({ ...a, url: storage.url(a.key) })),
    },
  };
}

const TICKET_MESSAGE_SELECT = {
  id: true,
  branch: true,
  status: true,
  createdAt: true,
  attachments: { select: { id: true, key: true, filename: true, contentType: true } },
} as const;

const DEFAULT_COLUMNS = [
  { name: 'TODO', slug: 'todo', color: '#f7768e', sortOrder: 0 },
  { name: 'In Progress', slug: 'in_progress', color: '#7aa2f7', sortOrder: 1 },
  { name: 'In Review', slug: 'in_review', color: '#e0af68', sortOrder: 2 },
  { name: 'Completed', slug: 'completed', color: '#9ece6a', sortOrder: 3 },
  { name: 'Merged', slug: 'merged', color: '#bb9af7', sortOrder: 4 },
];

const STATUS_TO_SLUG: Record<string, string> = {
  pending: 'todo',
  creation: 'in_progress',
  in_progress: 'in_progress',
  completed: 'completed',
  merged: 'merged',
};

export async function ensureKanbanColumns(channelId: string) {
  const existing = await prisma.kanbanColumn.findMany({
    where: { channelId },
    orderBy: { sortOrder: 'asc' },
  });

  if (existing.length === 0) {
    const columns = await prisma.$transaction(
      DEFAULT_COLUMNS.map((col) =>
        prisma.kanbanColumn.create({
          data: { channelId, ...col },
        }),
      ),
    );
    return columns;
  }

  // Add any missing default columns to existing boards
  const existingSlugs = new Set(existing.map((col) => col.slug));
  const missing = DEFAULT_COLUMNS.filter((col) => !existingSlugs.has(col.slug));

  if (missing.length > 0) {
    await prisma.$transaction(
      missing.map((col) =>
        prisma.kanbanColumn.create({
          data: { channelId, ...col },
        }),
      ),
    );
    return prisma.kanbanColumn.findMany({
      where: { channelId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  return existing;
}

export async function getBoard(channelId: string) {
  const columns = await ensureKanbanColumns(channelId);

  const columnsWithTickets = await prisma.kanbanColumn.findMany({
    where: { channelId },
    orderBy: { sortOrder: 'asc' },
    include: {
      tickets: {
        orderBy: { sortOrder: 'asc' },
        include: {
          message: {
            select: TICKET_MESSAGE_SELECT,
          },
        },
      },
    },
  });

  return columnsWithTickets;
}

export async function createTicketForMessage(
  messageId: string,
  channelId: string,
  text: string,
  channelName: string,
) {
  const columns = await ensureKanbanColumns(channelId);
  const todoColumn = columns.find((col) => col.slug === 'todo');
  if (!todoColumn) return null;

  // Check if ticket already exists for this message
  const existing = await prisma.ticket.findUnique({ where: { messageId } });
  if (existing) return existing;

  // Try AI generation, fallback to simple extraction
  const generated = await generateTicketFromMessage(text, channelName);

  const title = generated?.title ?? text.slice(0, 80);
  const description = generated?.description ?? text;
  const solutionApproach = generated?.solutionApproach ?? null;
  const metadata = generated?.metadata ?? null;

  const maxSort = await prisma.ticket.aggregate({
    where: { columnId: todoColumn.id },
    _max: { sortOrder: true },
  });

  const ticket = await prisma.ticket.create({
    data: {
      messageId,
      columnId: todoColumn.id,
      title,
      description,
      solutionApproach,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
    include: {
      message: {
        select: TICKET_MESSAGE_SELECT,
      },
    },
  });

  sseManager.broadcastChannel(channelId, 'ticket-created', {
    channelId,
    ticket: { ...resolveTicketAttachmentUrls(ticket), columnSlug: todoColumn.slug },
  });

  return ticket;
}

export async function updateTicketFromEvent(
  messageId: string,
  channelId: string,
  eventsContext: string,
  summary: string,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { messageId },
    include: { column: true },
  });
  if (!ticket) return null;

  const update = await updateTicketFromContext(
    { title: ticket.title, description: ticket.description, solutionApproach: ticket.solutionApproach },
    eventsContext,
    summary,
  );

  if (!update) return null;

  const data: Record<string, unknown> = {};
  if (update.description) data.description = update.description;
  if (update.solutionApproach) data.solutionApproach = update.solutionApproach;
  if (update.status) data.status = update.status;
  if (update.metadata) data.metadata = JSON.parse(JSON.stringify(update.metadata));

  if (Object.keys(data).length === 0) return ticket;

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data,
    include: {
      column: true,
      message: {
        select: TICKET_MESSAGE_SELECT,
      },
    },
  });

  sseManager.broadcastChannel(channelId, 'ticket-updated', {
    channelId,
    ticket: { ...resolveTicketAttachmentUrls(updated), columnSlug: updated.column.slug },
  });

  return updated;
}

export async function moveTicket(ticketId: string, columnId: string, sortOrder: number) {
  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { columnId, sortOrder },
    include: {
      column: true,
      message: {
        select: { ...TICKET_MESSAGE_SELECT, channelId: true },
      },
    },
  });

  const { channelId } = ticket.message;

  sseManager.broadcastChannel(channelId, 'ticket-updated', {
    channelId,
    ticket: { ...resolveTicketAttachmentUrls(ticket), columnSlug: ticket.column.slug },
  });

  return ticket;
}

export async function syncTicketWithMessageStatus(
  messageId: string,
  channelId: string,
  newStatus: string,
) {
  const targetSlug = STATUS_TO_SLUG[newStatus];
  if (!targetSlug) return null;

  const ticket = await prisma.ticket.findUnique({
    where: { messageId },
    include: { column: true },
  });
  if (!ticket) return null;

  // Don't move backwards (e.g., don't move from "merged" to "completed")
  if (ticket.column.slug === 'merged') return null;
  // Don't move if already in the target column
  if (ticket.column.slug === targetSlug) return null;

  const targetColumn = await prisma.kanbanColumn.findUnique({
    where: { channelId_slug: { channelId, slug: targetSlug } },
  });
  if (!targetColumn) return null;

  const maxSort = await prisma.ticket.aggregate({
    where: { columnId: targetColumn.id },
    _max: { sortOrder: true },
  });

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      columnId: targetColumn.id,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
    include: {
      column: true,
      message: {
        select: TICKET_MESSAGE_SELECT,
      },
    },
  });

  sseManager.broadcastChannel(channelId, 'ticket-updated', {
    channelId,
    ticket: { ...resolveTicketAttachmentUrls(updated), columnSlug: updated.column.slug },
  });

  return updated;
}

export async function refreshTicketBroadcast(messageId: string, channelId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { messageId },
    include: {
      column: true,
      message: { select: TICKET_MESSAGE_SELECT },
    },
  });
  if (!ticket) return;

  sseManager.broadcastChannel(channelId, 'ticket-updated', {
    channelId,
    ticket: { ...resolveTicketAttachmentUrls(ticket), columnSlug: ticket.column.slug },
  });
}

export async function createColumn(channelId: string, name: string, slug: string, color?: string) {
  const maxSort = await prisma.kanbanColumn.aggregate({
    where: { channelId },
    _max: { sortOrder: true },
  });

  return prisma.kanbanColumn.create({
    data: {
      channelId,
      name,
      slug,
      color: color ?? null,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateColumn(columnId: string, data: { name?: string; color?: string; sortOrder?: number }) {
  return prisma.kanbanColumn.update({
    where: { id: columnId },
    data,
  });
}

export async function deleteColumn(columnId: string) {
  return prisma.kanbanColumn.delete({ where: { id: columnId } });
}
