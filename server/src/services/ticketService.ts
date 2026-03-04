import prisma from "../lib/prisma";
import { pubsub, TOPICS } from "./pubsub";
import {
  generateTicketFromMessage,
  updateTicketFromContext,
  mergeSemanticContext,
  type TicketMetadata,
} from "./ticketAiService";
import { getStorage } from "./storageService";
import { ensureManualInputCliSession, getWorkspaceByIdForFeed } from "./workspaceService";

function resolveTicketAttachmentUrls<
  T extends {
    workspace: {
      attachments: {
        id: string;
        key: string;
        filename: string;
        contentType: string;
      }[];
    } | null;
  },
>(ticket: T) {
  if (!ticket.workspace) return ticket;
  const storage = getStorage();
  return {
    ...ticket,
    workspace: {
      ...ticket.workspace,
      attachments: ticket.workspace.attachments.map((a) => ({
        ...a,
        url: storage.url(a.key),
      })),
    },
  };
}

const TICKET_WORKSPACE_SELECT = {
  id: true,
  branch: true,
  prUrl: true,
  status: true,
  createdAt: true,
  attachments: {
    select: { id: true, key: true, filename: true, contentType: true },
  },
} as const;

const DEFAULT_COLUMNS = [
  { name: "TODO", slug: "todo", color: "#f7768e", sortOrder: 0 },
  { name: "In Progress", slug: "in_progress", color: "#7aa2f7", sortOrder: 1 },
  { name: "In Review", slug: "in_review", color: "#e0af68", sortOrder: 2 },
  { name: "Completed", slug: "completed", color: "#9ece6a", sortOrder: 3 },
  { name: "Merged", slug: "merged", color: "#bb9af7", sortOrder: 4 },
];

const STATUS_TO_SLUG: Record<string, string> = {
  pending: "todo",
  queued: "todo",
  handed_off: "todo",
  creation: "in_progress",
  in_progress: "in_progress",
  needs_input: "in_review",
  review: "in_review",
  completed: "completed",
  merged: "merged",
};

export async function ensureKanbanColumns(channelId: string) {
  const existing = await prisma.kanbanColumn.findMany({
    where: { channelId },
    orderBy: { sortOrder: "asc" },
  });

  if (existing.length === 0) {
    // Verify the channel exists before creating columns
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) return [];

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
      orderBy: { sortOrder: "asc" },
    });
  }

  return existing;
}

export async function getBoard(channelId: string) {
  const columns = await ensureKanbanColumns(channelId);

  const columnsWithTickets = await prisma.kanbanColumn.findMany({
    where: { channelId },
    orderBy: { sortOrder: "asc" },
    include: {
      tickets: {
        orderBy: { sortOrder: "asc" },
        include: {
          workspace: {
            select: TICKET_WORKSPACE_SELECT,
          },
        },
      },
    },
  });

  return columnsWithTickets;
}

export async function createTicketForWorkspace(
  workspaceId: string,
  channelId: string,
  text: string,
  channelName: string,
) {
  const columns = await ensureKanbanColumns(channelId);
  const todoColumn = columns.find((col) => col.slug === "todo");
  if (!todoColumn) return null;

  // Check if ticket already exists for this workspace
  const existing = await prisma.ticket.findUnique({ where: { workspaceId } });
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
      workspaceId,
      columnId: todoColumn.id,
      title,
      description,
      solutionApproach,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
    include: {
      workspace: {
        select: TICKET_WORKSPACE_SELECT,
      },
    },
  });

  pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
    ticketUpserted: {
      channelId,
      ticket: resolveTicketAttachmentUrls(ticket),
      columnSlug: todoColumn.slug,
    },
  });

  return ticket;
}

export async function linkTicketToWorkspace(
  ticketId: string,
  workspaceId: string,
  channelId: string,
) {
  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { workspaceId },
    include: {
      column: true,
      workspace: { select: TICKET_WORKSPACE_SELECT },
    },
  });

  pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
    ticketUpserted: {
      channelId,
      ticket: resolveTicketAttachmentUrls(ticket),
      columnSlug: ticket.column.slug,
    },
  });

  return ticket;
}

export async function updateTicketFromEvent(
  workspaceId: string,
  channelId: string,
  eventsContext: string,
  summary: string,
  fileChanges?: Array<{ file: string; operation: string }>,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { workspaceId },
    include: { column: true },
  });
  if (!ticket) return null;

  const update = await updateTicketFromContext(
    {
      title: ticket.title,
      description: ticket.description,
      solutionApproach: ticket.solutionApproach,
      metadata: ticket.metadata,
    },
    eventsContext,
    summary,
    fileChanges,
  );

  if (!update) return null;

  const existingMeta = (ticket.metadata ?? {}) as TicketMetadata;
  const incomingMeta = update.metadata as TicketMetadata | undefined;

  // Merge semantic context with existing data instead of replacing
  const mergedSemantic = mergeSemanticContext(
    existingMeta.semanticContext,
    incomingMeta?.semanticContext,
  );

  const mergedMetadata: TicketMetadata = {
    ...existingMeta,
    ...(incomingMeta ?? {}),
    semanticContext: mergedSemantic,
  };

  // Only include metadata in the update if it has new semantic content
  const hasNewSemantic = incomingMeta?.semanticContext &&
    Object.values(incomingMeta.semanticContext).some((v) => Array.isArray(v) ? v.length > 0 : !!v);

  const data: Record<string, unknown> = {};
  if (update.description) data.description = update.description;
  if (update.solutionApproach) data.solutionApproach = update.solutionApproach;
  if (update.status) data.status = update.status;
  if (hasNewSemantic || incomingMeta?.tags || incomingMeta?.complexity) {
    data.metadata = JSON.parse(JSON.stringify(mergedMetadata));
  }

  if (Object.keys(data).length === 0) return ticket;

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data,
    include: {
      column: true,
      workspace: {
        select: TICKET_WORKSPACE_SELECT,
      },
    },
  });

  pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
    ticketUpserted: {
      channelId,
      ticket: resolveTicketAttachmentUrls(updated),
      columnSlug: updated.column.slug,
    },
  });

  return updated;
}

export async function moveTicket(
  ticketId: string,
  columnId: string,
  sortOrder: number,
) {
  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { columnId, sortOrder },
    include: {
      column: { select: { id: true, slug: true, channelId: true } },
      workspace: {
        select: TICKET_WORKSPACE_SELECT,
      },
    },
  });

  const { channelId } = ticket.column;

  pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
    ticketUpserted: {
      channelId,
      ticket: resolveTicketAttachmentUrls(ticket),
      columnSlug: ticket.column.slug,
    },
  });

  return ticket;
}

export async function syncTicketWithWorkspaceStatus(
  workspaceId: string,
  channelId: string,
  newStatus: string,
) {
  const targetSlug = STATUS_TO_SLUG[newStatus];
  if (!targetSlug) return null;

  const ticket = await prisma.ticket.findUnique({
    where: { workspaceId },
    include: { column: true },
  });
  if (!ticket) return null;

  // Don't move backwards (e.g., don't move from "merged" to "completed")
  if (ticket.column.slug === "merged") {
    await refreshTicketBroadcast(workspaceId, channelId);
    return null;
  }
  // Don't move if already in the target column
  if (ticket.column.slug === targetSlug) {
    await refreshTicketBroadcast(workspaceId, channelId);
    return null;
  }

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
      workspace: {
        select: TICKET_WORKSPACE_SELECT,
      },
    },
  });

  pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
    ticketUpserted: {
      channelId,
      ticket: resolveTicketAttachmentUrls(updated),
      columnSlug: updated.column.slug,
    },
  });

  return updated;
}

export async function refreshTicketBroadcast(
  workspaceId: string,
  channelId: string,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { workspaceId },
    include: {
      column: true,
      workspace: { select: TICKET_WORKSPACE_SELECT },
    },
  });
  if (!ticket) return;

  pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
    ticketUpserted: {
      channelId,
      ticket: resolveTicketAttachmentUrls(ticket),
      columnSlug: ticket.column.slug,
    },
  });
}

export async function checkAndTriggerDependents(
  completedWorkspaceId: string,
  channelId: string,
) {
  try {
    // Find all dependencies where the completed workspace is a dependency target
    const waitingDeps = await prisma.ticketDependency.findMany({
      where: { dependsOnWorkspaceId: completedWorkspaceId },
      select: { ticketWorkspaceId: true },
    });

    const uniqueTicketIds = [
      ...new Set(waitingDeps.map((d) => d.ticketWorkspaceId)),
    ];

    for (const ticketWorkspaceId of uniqueTicketIds) {
      // Get all deps for this waiting ticket
      const allDeps = await prisma.ticketDependency.findMany({
        where: { ticketWorkspaceId },
        include: {
          dependsOn: { select: { status: true } },
        },
      });

      // Check if ALL dependencies are merged
      const allMet = allDeps.every((dep) => dep.dependsOn.status === "merged");
      if (!allMet) continue;

      // Atomically claim the ticket: only proceed if status is still 'queued'.
      // This prevents double-fire when two deps complete near-simultaneously.
      const { count } = await prisma.workspace.updateMany({
        where: { id: ticketWorkspaceId, status: "queued" },
        data: { status: "creation" },
      });
      if (count === 0) continue;

      const workspace = await prisma.workspace.findUnique({
        where: { id: ticketWorkspaceId },
        select: { queuedRunConfig: true },
      });

      if (!workspace?.queuedRunConfig) continue;

      // Publish ready-to-run event
      pubsub.publish(TOPICS.TICKET_READY_TO_RUN(channelId), {
        ticketReadyToRun: {
          channelId,
          workspaceId: ticketWorkspaceId,
          runConfig: workspace.queuedRunConfig,
        },
      });
    }
  } catch (err) {
    console.error("[ticketService] checkAndTriggerDependents failed:", err);
  }
}

export async function createColumn(
  channelId: string,
  name: string,
  slug: string,
  color?: string,
) {
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

export async function updateColumn(
  columnId: string,
  data: { name?: string; color?: string; sortOrder?: number },
) {
  return prisma.kanbanColumn.update({
    where: { id: columnId },
    data,
  });
}

export async function deleteColumn(columnId: string) {
  return prisma.kanbanColumn.delete({ where: { id: columnId } });
}

interface ImportTicketInput {
  ticketJsonId: string;
  title: string;
  body: string;
  dependencies: string[];
}

export async function importTicketsToProject(
  channelId: string,
  tickets: ImportTicketInput[],
  runConfig: object,
) {
  const USER_CLI_SESSION_ID = "user-manual-input";

  // Validate inputs
  if (tickets.length === 0) throw new Error("No tickets to import");
  const ids = tickets.map((t) => t.ticketJsonId);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate ticket IDs found");

  // 1. Ensure kanban columns exist and find TODO column
  const columns = await ensureKanbanColumns(channelId);
  const todoColumn = columns.find((col) => col.slug === "todo");
  if (!todoColumn) throw new Error("Could not create TODO column for channel");

  // 2. Ensure the manual-input CLI session exists
  await ensureManualInputCliSession();

  // 3. All DB writes in a single transaction
  const results = await prisma.$transaction(async (tx) => {
    const maxSort = await tx.ticket.aggregate({
      where: { columnId: todoColumn.id },
      _max: { sortOrder: true },
    });
    let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const ticketJsonIdToWorkspaceId = new Map<string, string>();
    const txResults: { ticketJsonId: string; workspaceId: string; ticketId: string }[] = [];

    // Create workspaces, sessions, events, and tickets
    for (const t of tickets) {
      const isRoot = t.dependencies.length === 0;

      const workspace = await tx.workspace.create({
        data: {
          channelId,
          cliSessionId: USER_CLI_SESSION_ID,
          preview: t.title,
          status: isRoot ? "pending" : "queued",
          importance: "important",
        },
      });

      const session = await tx.session.create({
        data: { workspaceId: workspace.id },
      });

      const prompt = `<trace-internal>\nThis ticket is part of a project. Before starting, read the scoping documents for full context:\n- .trace/product-scoping.md\n- .trace/technical-scoping.md\n- .trace/tickets.json\n</trace-internal>\n\n${t.body}`;

      await tx.event.create({
        data: {
          cliSessionId: USER_CLI_SESSION_ID,
          hookEventName: "UserPromptSubmit",
          rawPayload: JSON.parse(JSON.stringify({
            hook_event_name: "UserPromptSubmit",
            prompt,
            source: "ui",
          })),
          sessionId: session.id,
          importance: "important",
        },
      });

      await tx.ticket.create({
        data: {
          workspaceId: workspace.id,
          columnId: todoColumn.id,
          title: t.title,
          description: t.body,
          sortOrder: sortOrder++,
        },
      });

      ticketJsonIdToWorkspaceId.set(t.ticketJsonId, workspace.id);
      txResults.push({
        ticketJsonId: t.ticketJsonId,
        workspaceId: workspace.id,
        ticketId: workspace.id, // ticket is 1:1 with workspace
      });
    }

    // Create dependency rows and save runConfig for queued tickets
    for (const t of tickets) {
      if (t.dependencies.length === 0) continue;

      const workspaceId = ticketJsonIdToWorkspaceId.get(t.ticketJsonId)!;
      const depWorkspaceIds = t.dependencies
        .map((depId) => ticketJsonIdToWorkspaceId.get(depId))
        .filter((id): id is string => !!id);

      if (depWorkspaceIds.length > 0) {
        await tx.ticketDependency.createMany({
          data: depWorkspaceIds.map((depId) => ({
            ticketWorkspaceId: workspaceId,
            dependsOnWorkspaceId: depId,
          })),
        });

        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            queuedRunConfig: { ...runConfig, prompt: t.body } as object,
          },
        });
      }
    }

    return txResults;
  });

  // 4. Publish events outside the transaction (batched reads)
  const workspaceIds = results.map((r) => r.workspaceId);

  const [hydratedWorkspaces, allTickets] = await Promise.all([
    prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      include: {
        cliSession: { select: { sessionId: true, cwd: true, status: true } },
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { sessions: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { workspaceId: { in: workspaceIds } },
      include: {
        workspace: { select: TICKET_WORKSPACE_SELECT },
      },
    }),
  ]);

  for (const ws of hydratedWorkspaces) {
    pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
      workspaceUpserted: ws,
    });
  }

  for (const ticket of allTickets) {
    pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
      ticketUpserted: {
        channelId,
        ticket: resolveTicketAttachmentUrls(ticket),
        columnSlug: todoColumn.slug,
      },
    });
  }

  return results;
}
