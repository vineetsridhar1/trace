import prisma from "../lib/prisma";
import { pubsub, TOPICS } from "./pubsub";
import {
  generateTicketFromMessage,
  updateTicketFromContext,
  mergeSemanticContext,
  type TicketMetadata,
} from "./ticketAiService";
import { getStorage } from "./storageService";
import {
  ensureManualInputCliSession,
  getWorkspaceByIdForFeed,
  updateWorkspaceStatus,
} from "./workspaceService";

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
  userId: true,
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

const ACTIVE_WORKSPACE_STATUSES = ["creation", "in_progress"];

// Time after the last event before we consider a workspace "stale". Any Claude
// event (PostToolUse, PreToolUse, UserPromptSubmit, Stop, etc.) resets the
// cliSession.lastSeenAt timestamp, so this threshold means "no activity of any
// kind for 8 minutes". The client-side reconciliation checks every 60 seconds,
// so this server-side safety net only fires if the client missed it too.
const STALE_THRESHOLD_MS = 8 * 60 * 1000;

// Grace period after a session stops before we reconcile it. This prevents
// racing with the normal auto-complete path in ingestEvent which also
// transitions the workspace on Stop events.
const STOPPED_GRACE_MS = 30 * 1000;

/**
 * Detect workspaces in active statuses that are actually done.
 *
 * Two heuristics:
 * 1. The CLI session is marked "stopped" (Stop event was received by the
 *    server, but auto-complete didn't transition the workspace).
 * 2. No events have arrived in STALE_THRESHOLD_MS and the workspace is still
 *    in an active state. This covers the case where the Stop event was lost
 *    entirely (e.g. server was down when Claude exited).
 */
async function reconcileStaleWorkspaces(channelId: string): Promise<void> {
  try {
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    const stoppedGrace = new Date(Date.now() - STOPPED_GRACE_MS);

    // Find workspaces in active states whose CLI session is stopped, OR
    // whose CLI session hasn't reported in since the stale threshold.
    const stuckWorkspaces = await prisma.workspace.findMany({
      where: {
        channelId,
        status: { in: ACTIVE_WORKSPACE_STATUSES },
        OR: [
          // Case 1: CLI session explicitly stopped AND grace period elapsed
          // (avoids racing with the normal auto-complete in ingestEvent)
          {
            cliSession: { status: "stopped", lastSeenAt: { lt: stoppedGrace } },
          },
          // Case 2: CLI session hasn't sent events in a while
          { cliSession: { lastSeenAt: { lt: staleThreshold } } },
        ],
      },
      select: { id: true, status: true },
    });

    for (const ws of stuckWorkspaces) {
      // "creation" means the workspace was being set up — revert to "pending"
      // so it can be restarted. For everything else, transition to "completed".
      const newStatus = ws.status === "creation" ? "pending" : "completed";

      console.warn(
        `[reconcileStaleWorkspaces] Workspace ${ws.id} stuck in "${ws.status}" — transitioning to "${newStatus}"`,
      );

      await updateWorkspaceStatus(ws.id, newStatus);

      // Sync the ticket column too (belt-and-suspenders — reconcileTicketColumns
      // will also catch it, but broadcasting now means the live UI updates faster).
      void syncTicketWithWorkspaceStatus(ws.id, channelId, newStatus);

      // If any dependents were waiting on this workspace, check them now.
      void checkAndTriggerDependents(ws.id, channelId);

      // Notify orchestrator of the status change
      void notifyOrchestratorOfStatusChange(ws.id, channelId, newStatus);
    }
  } catch (err) {
    console.error("[reconcileStaleWorkspaces] failed:", err);
  }
}

/**
 * Fix tickets whose kanban column doesn't match their workspace's status.
 *
 * This catches drift caused by missed pubsub events, partial failures in
 * syncTicketWithWorkspaceStatus, or any other reason the ticket column fell
 * out of sync with the workspace status.
 */
async function reconcileTicketColumns(channelId: string): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { column: { channelId } },
      include: {
        column: true,
        workspace: { select: { id: true, status: true } },
      },
    });

    for (const ticket of tickets) {
      if (!ticket.workspace) continue;

      const expectedSlug = STATUS_TO_SLUG[ticket.workspace.status];
      if (!expectedSlug) continue;

      // Already correct, or merged tickets never move backward
      if (
        ticket.column.slug === expectedSlug ||
        ticket.column.slug === "merged"
      ) {
        continue;
      }

      const targetColumn = await prisma.kanbanColumn.findUnique({
        where: { channelId_slug: { channelId, slug: expectedSlug } },
      });
      if (!targetColumn) continue;

      const maxSort = await prisma.ticket.aggregate({
        where: { columnId: targetColumn.id },
        _max: { sortOrder: true },
      });

      console.warn(
        `[reconcileTicketColumns] Ticket ${ticket.id} (workspace ${ticket.workspace.id}) in column "${ticket.column.slug}" but workspace is "${ticket.workspace.status}" — moving to "${expectedSlug}"`,
      );

      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          columnId: targetColumn.id,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
        include: {
          column: true,
          workspace: { select: TICKET_WORKSPACE_SELECT },
        },
      });

      pubsub.publish(TOPICS.TICKET_UPSERTED(channelId), {
        ticketUpserted: {
          channelId,
          ticket: resolveTicketAttachmentUrls(updated),
          columnSlug: updated.column.slug,
        },
      });
    }
  } catch (err) {
    console.error("[reconcileTicketColumns] failed:", err);
  }
}

export async function getTicketByWorkspaceId(workspaceId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { workspaceId },
    include: {
      column: true,
      workspace: { select: TICKET_WORKSPACE_SELECT },
    },
  });
  if (!ticket) return null;
  return resolveTicketAttachmentUrls(ticket);
}

export async function getBoard(channelId: string) {
  const columns = await ensureKanbanColumns(channelId);

  // Reconcile stale workspaces and mismatched ticket columns before returning
  // the board. This catches stuck states caused by missed events, server
  // restarts, or client-side reconciliation failures.
  await reconcileStaleWorkspaces(channelId);
  await reconcileTicketColumns(channelId);

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

  // Filter out tickets whose workspace has been soft-deleted (safety net for
  // previously-deleted workspaces whose tickets weren't cleaned up)
  return columnsWithTickets.map((col) => ({
    ...col,
    tickets: col.tickets.filter((t) => t.workspace?.status !== "deleted"),
  }));
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
  const hasNewSemantic =
    incomingMeta?.semanticContext &&
    Object.values(incomingMeta.semanticContext).some((v) =>
      Array.isArray(v) ? v.length > 0 : !!v,
    );

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

/**
 * If the workspace is an autonomous ticket (has queuedRunConfig with autonomous flag),
 * publish TICKET_READY_FOR_REVIEW so the client spawns a review agent.
 *
 * Uses an atomic status transition (completed → review) to prevent double-fire
 * when runAutoCompleteIfNeeded is called multiple times.
 */
export async function triggerReviewIfAutonomous(
  workspaceId: string,
  channelId: string,
) {
  try {
    // Only trigger for workspaces that are actual tickets
    const ticket = await prisma.ticket.findUnique({
      where: { workspaceId },
      select: { id: true },
    });
    if (!ticket) return;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { queuedRunConfig: true, sessions: { select: { id: true } } },
    });

    const runConfig = workspace?.queuedRunConfig as Record<
      string,
      unknown
    > | null;
    if (!runConfig?.autonomous) return;

    // If a review was already attempted, skip the review cycle and auto-merge.
    // This prevents an infinite loop when the review agent finds no changes to merge.
    if (runConfig.reviewTriggered) {
      const { count } = await prisma.workspace.updateMany({
        where: { id: workspaceId, status: "completed" },
        data: { status: "merged" },
      });
      if (count === 0) return;

      void syncTicketWithWorkspaceStatus(workspaceId, channelId, "merged");
      void checkAndTriggerDependents(workspaceId, channelId);
      return;
    }

    // Atomically claim: only proceed if status is still 'completed'.
    // Prevents double-fire when runAutoCompleteIfNeeded runs multiple times.
    const { count } = await prisma.workspace.updateMany({
      where: { id: workspaceId, status: "completed" },
      data: { status: "review" },
    });
    if (count === 0) return;

    // Mark that we've triggered a review so we don't loop if the review agent
    // finishes without merging (e.g. no diff to push).
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        queuedRunConfig: { ...runConfig, reviewTriggered: true },
      },
    });

    void syncTicketWithWorkspaceStatus(workspaceId, channelId, "review");

    pubsub.publish(TOPICS.TICKET_READY_FOR_REVIEW(channelId), {
      ticketReadyForReview: {
        channelId,
        workspaceId,
        runConfig,
      },
    });
  } catch (err) {
    console.error("[ticketService] triggerReviewIfAutonomous failed:", err);
  }
}

const ORCHESTRATOR_SIGNIFICANT_STATUSES = new Set([
  "completed",
  "merged",
  "needs_input",
]);

/**
 * Notify the frontend that an orchestrator should be triggered because a
 * non-orchestrator workspace in the same channel changed to a significant
 * status. Publishes a server-scoped event so the frontend can react
 * regardless of which channel the user is currently viewing.
 *
 * The payload includes the orchestrator workspace ID so the frontend can
 * spawn it directly without needing the workspace in its local store
 * (which only contains the active channel's workspaces).
 */
export async function notifyOrchestratorOfStatusChange(
  workspaceId: string,
  channelId: string,
  newStatus: string,
): Promise<void> {
  try {
    if (!ORCHESTRATOR_SIGNIFICANT_STATUSES.has(newStatus)) return;

    // Single query: fetch workspace with its channel in one round-trip
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        isOrchestrator: true,
        preview: true,
        ticket: { select: { title: true } },
        channel: {
          select: { orchestrateMode: true, serverId: true },
        },
      },
    });
    if (!workspace || workspace.isOrchestrator) return;
    if (!workspace.channel.orchestrateMode) return;

    // Find the orchestrator workspace for this channel (must not be merged)
    const orchestrator = await prisma.workspace.findFirst({
      where: {
        channelId,
        isOrchestrator: true,
        status: { not: "merged" },
      },
      select: { id: true },
    });
    if (!orchestrator) return;

    const ticketTitle =
      workspace.ticket?.title ?? workspace.preview ?? workspaceId.slice(0, 8);

    pubsub.publish(TOPICS.ORCHESTRATOR_TRIGGER(workspace.channel.serverId), {
      orchestratorTrigger: {
        channelId,
        workspaceId,
        newStatus,
        ticketTitle,
        orchestratorWorkspaceId: orchestrator.id,
      },
    });
  } catch (err) {
    console.error(
      "[ticketService] notifyOrchestratorOfStatusChange failed:",
      err,
    );
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
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate ticket IDs found");

  // 1. Ensure kanban columns exist and find TODO column
  const columns = await ensureKanbanColumns(channelId);
  const todoColumn = columns.find((col) => col.slug === "todo");
  if (!todoColumn) throw new Error("Could not create TODO column for channel");

  // 2. Ensure the manual-input CLI session exists
  await ensureManualInputCliSession();

  const isAutonomous = !!(runConfig as Record<string, unknown>).autonomous;

  // 3. All DB writes in a single transaction
  const results = await prisma.$transaction(async (tx) => {
    const maxSort = await tx.ticket.aggregate({
      where: { columnId: todoColumn.id },
      _max: { sortOrder: true },
    });
    let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const ticketJsonIdToWorkspaceId = new Map<string, string>();
    const txResults: {
      ticketJsonId: string;
      workspaceId: string;
      ticketId: string;
    }[] = [];

    // Create workspaces, sessions, events, and tickets
    for (const t of tickets) {
      const isRoot = t.dependencies.length === 0;

      const workspace = await tx.workspace.create({
        data: {
          channelId,
          cliSessionId: USER_CLI_SESSION_ID,
          preview: t.title,
          status: isRoot && !isAutonomous ? "pending" : "queued",
          importance: "important",
          ...(isRoot && isAutonomous
            ? { queuedRunConfig: { ...runConfig, prompt: t.body } as object }
            : {}),
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
          rawPayload: JSON.parse(
            JSON.stringify({
              hook_event_name: "UserPromptSubmit",
              prompt,
              source: "ui",
            }),
          ),
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
        cliSession: { select: { sessionId: true, cwd: true, status: true, permissionMode: true } },
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
