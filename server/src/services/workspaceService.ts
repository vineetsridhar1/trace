import prisma from '../lib/prisma';
import { Prisma } from '../../prisma/generated/prisma/client';
import { getStorage } from './storageService';

const USER_CLI_SESSION_ID = 'user-manual-input';

type WorkspaceWithSessions = Prisma.WorkspaceGetPayload<{
  include: { sessions: true };
}>;

type FeedWorkspace = Prisma.WorkspaceGetPayload<{
  include: {
    cliSession: { select: { sessionId: true; cwd: true; status: true } };
    user: { select: { id: true; name: true; avatarUrl: true } };
    _count: { select: { sessions: true } };
  };
}>;

interface AttachmentMeta {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  url: string;
  localPath: string;
}

async function resolveAttachmentMetas(attachmentIds: string[]): Promise<AttachmentMeta[]> {
  if (attachmentIds.length === 0) return [];
  const storage = getStorage();
  const attachments = await prisma.attachment.findMany({
    where: { id: { in: attachmentIds } },
  });
  return attachments.map((a) => ({
    id: a.id,
    key: a.key,
    filename: a.filename,
    contentType: a.contentType,
    url: storage.url(a.key),
    localPath: storage.localPath(a.key),
  }));
}

function buildUserPromptPayload(text: string, attachments?: AttachmentMeta[]) {
  return {
    hook_event_name: 'UserPromptSubmit',
    prompt: text,
    source: 'ui',
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
}

async function ensureManualInputCliSession() {
  const cliSession = await prisma.cliSession.findUnique({ where: { sessionId: USER_CLI_SESSION_ID } });
  if (cliSession) {
    return cliSession;
  }
  return prisma.cliSession.create({
    data: { sessionId: USER_CLI_SESSION_ID, status: 'active' },
  });
}

async function ensureWorkspaceHasSession(workspace: WorkspaceWithSessions): Promise<WorkspaceWithSessions> {
  if (workspace.sessions.length > 0) {
    return workspace;
  }

  const session = await prisma.session.create({
    data: { workspaceId: workspace.id },
  });

  return {
    ...workspace,
    sessions: [session],
  };
}

export async function getWorkspaceByIdForFeed(workspaceId: string): Promise<FeedWorkspace | null> {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      cliSession: { select: { sessionId: true, cwd: true, status: true } },
      user: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { sessions: true } },
    },
  });
}

export async function getWorkspaceByIdWithSessions(workspaceId: string): Promise<WorkspaceWithSessions | null> {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { sessions: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function getWorkspacesByChannel(
  channelId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const { limit = 50, offset = 0 } = options;

  const where = { channelId, status: { not: 'deleted' } };

  const [workspaces, total] = await Promise.all([
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        cliSession: { select: { sessionId: true, cwd: true, status: true } },
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { sessions: true } },
      },
    }),
    prisma.workspace.count({ where }),
  ]);

  return { workspaces, total, limit, offset };
}

export async function getOrCreateWorkspaceForCliSession(channelId: string, cliSessionId: string) {
  let workspace = await prisma.workspace.findFirst({
    where: { channelId, cliSessionId },
    include: { sessions: { orderBy: { createdAt: 'asc' } } },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        channelId,
        cliSessionId,
        sessions: {
          create: {},
        },
      },
      include: { sessions: true },
    });
  }

  return ensureWorkspaceHasSession(workspace);
}

export async function updateWorkspaceStatus(workspaceId: string, status: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { status },
  });
}

export async function softDeleteWorkspace(workspaceId: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { status: 'deleted' },
  });
}

export async function updateWorkspacePreviewAndImportance(
  workspaceId: string,
  preview: string | null,
  importance: string,
) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(preview !== null ? { preview } : {}),
      importance,
    },
  });
}

export async function updateWorkspaceSummaryAndBranch(
  workspaceId: string,
  summary: string | null,
  branch: string | null,
) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(summary !== null ? { summary } : {}),
      ...(branch !== null ? { branch } : {}),
    },
  });
}

export async function createUserWorkspace(channelId: string, text: string, attachmentIds?: string[]) {
  await ensureManualInputCliSession();

  const attachmentMetas = await resolveAttachmentMetas(attachmentIds ?? []);

  const created = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        channelId,
        cliSessionId: USER_CLI_SESSION_ID,
        preview: text,
        importance: 'important',
        ...(attachmentIds && attachmentIds.length > 0
          ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
          : {}),
      },
    });

    const session = await tx.session.create({
      data: { workspaceId: workspace.id },
    });

    const event = await tx.event.create({
      data: {
        cliSessionId: USER_CLI_SESSION_ID,
        hookEventName: 'UserPromptSubmit',
        rawPayload: JSON.parse(JSON.stringify(buildUserPromptPayload(text, attachmentMetas))),
        sessionId: session.id,
        importance: 'important',
      },
    });

    return { workspaceId: workspace.id, session, event };
  });

  const workspace = await getWorkspaceByIdForFeed(created.workspaceId);
  if (!workspace) {
    throw new Error(`Failed to load created workspace ${created.workspaceId}`);
  }

  return {
    workspace,
    session: created.session,
    event: created.event,
  };
}

export async function appendPromptToWorkspaceSession(
  channelId: string,
  workspaceId: string,
  text: string,
  attachmentIds?: string[],
  createNewSession?: boolean,
  sessionId?: string,
) {
  const attachmentMetas = await resolveAttachmentMetas(attachmentIds ?? []);

  const created = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, channelId },
      include: { sessions: { orderBy: { createdAt: 'asc' } } },
    });

    if (!workspace) {
      return null;
    }

    let session;
    if (sessionId) {
      // Use the specified session
      const existing = workspace.sessions.find((t) => t.id === sessionId);
      session = existing ?? await tx.session.create({ data: { workspaceId: workspace.id } });
    } else if (createNewSession) {
      session = await tx.session.create({ data: { workspaceId: workspace.id } });
    } else {
      session = workspace.sessions[workspace.sessions.length - 1] ?? await tx.session.create({ data: { workspaceId: workspace.id } });
    }

    const event = await tx.event.create({
      data: {
        cliSessionId: workspace.cliSessionId,
        hookEventName: 'UserPromptSubmit',
        rawPayload: JSON.parse(JSON.stringify(buildUserPromptPayload(text, attachmentMetas))),
        sessionId: session.id,
        importance: 'important',
      },
    });

    await tx.workspace.update({
      where: { id: workspace.id },
      data: {
        importance: 'important',
        ...(attachmentIds && attachmentIds.length > 0
          ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
          : {}),
      },
    });

    return {
      workspaceId: workspace.id,
      session,
      event,
    };
  });

  if (!created) {
    return null;
  }

  const workspace = await getWorkspaceByIdForFeed(created.workspaceId);
  if (!workspace) {
    throw new Error(`Failed to load updated workspace ${created.workspaceId}`);
  }

  return {
    workspace,
    session: created.session,
    event: created.event,
  };
}

export async function updateInitialPrompt(channelId: string, workspaceId: string, newText: string, attachmentIds?: string[]) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, channelId },
    include: { sessions: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  if (!workspace || workspace.sessions.length === 0) {
    return null;
  }

  const session = workspace.sessions[0];

  // Find the first UserPromptSubmit event in this session
  const event = await prisma.event.findFirst({
    where: { sessionId: session.id, hookEventName: 'UserPromptSubmit' },
    orderBy: { timestamp: 'asc' },
  });

  if (!event) {
    return null;
  }

  // Resolve attachment metadata if provided
  const attachmentMetas = attachmentIds ? await resolveAttachmentMetas(attachmentIds) : undefined;

  // Build the full updated payload
  const updatedPayload = buildUserPromptPayload(newText, attachmentMetas);

  const [updatedEvent] = await prisma.$transaction([
    prisma.event.update({
      where: { id: event.id },
      data: { rawPayload: JSON.parse(JSON.stringify(updatedPayload)) },
    }),
    prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        preview: newText,
        ...(attachmentIds && attachmentIds.length > 0
          ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
          : {}),
      },
    }),
  ]);

  const feedWorkspace = await getWorkspaceByIdForFeed(workspaceId);
  if (!feedWorkspace) {
    throw new Error(`Failed to load workspace ${workspaceId}`);
  }

  return { workspace: feedWorkspace, session, event: updatedEvent };
}

export async function getEventsByWorkspace(
  workspaceId: string,
  options: { limit?: number; offset?: number; after?: string } = {},
) {
  const { limit = 50, offset = 0, after } = options;

  const sessions = await prisma.session.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  const sessionIds = sessions.map((t) => t.id);

  if (sessionIds.length === 0) {
    return { events: [], total: 0, limit, offset, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, latestContextTokens: 0 };
  }

  const where: Record<string, unknown> = { sessionId: { in: sessionIds } };
  if (after) where.timestamp = { gt: new Date(after) };

  const [rawEvents, total, allEventsForAggregation] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.event.count({ where }),
    prisma.event.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { rawPayload: true },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  const events = rawEvents.reverse();

  // Compute token aggregates from ALL events across sessions.
  // Prefer authoritative cli_usage from Stop events (set by --output-format json).
  let inputTokens = 0;
  let outputTokens = 0;
  let latestContextTokens = 0;
  let cliCostUsd: number | undefined;
  let hasCliUsage = false;

  for (const evt of allEventsForAggregation) {
    const payload = evt.rawPayload as Record<string, unknown>;
    const cliUsage = payload?.cli_usage as { input_tokens?: number; output_tokens?: number } | undefined;
    if (cliUsage) {
      hasCliUsage = true;
      inputTokens += cliUsage.input_tokens ?? 0;
      outputTokens += cliUsage.output_tokens ?? 0;
      if (typeof payload?.cli_cost_usd === 'number') {
        cliCostUsd = (cliCostUsd ?? 0) + payload.cli_cost_usd;
      }
    }
    // Always use per-call usage for latestContextTokens (context window size),
    // NOT cli_usage which is the cumulative session total.
    const usage = payload?.usage as { input_tokens?: number } | undefined;
    if (usage?.input_tokens) {
      latestContextTokens = usage.input_tokens;
    }
  }

  // Fall back to old dedup logic if no cli_usage found
  if (!hasCliUsage) {
    let prevInputTokens = 0;
    let prevOutputTokens = 0;
    for (const evt of allEventsForAggregation) {
      const usage = (evt.rawPayload as Record<string, unknown>)?.usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (usage) {
        const curInput = usage.input_tokens ?? 0;
        const curOutput = usage.output_tokens ?? 0;
        if (curInput !== prevInputTokens || curOutput !== prevOutputTokens) {
          inputTokens += curInput;
          outputTokens += curOutput;
          prevInputTokens = curInput;
          prevOutputTokens = curOutput;
        }
        if (curInput) {
          latestContextTokens = curInput;
        }
      }
    }
  }

  return {
    events,
    total,
    limit,
    offset,
    tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    latestContextTokens,
    ...(cliCostUsd !== undefined && { cliCostUsd }),
  };
}

export async function createEmptySession(workspaceId: string) {
  return prisma.session.create({
    data: { workspaceId },
    include: { _count: { select: { events: true } } },
  });
}

export async function getSessionsByWorkspace(workspaceId: string) {
  return prisma.session.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { events: true } } },
  });
}

export async function claimWorkspace(workspaceId: string, userId: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { userId },
  });
}

export async function releaseWorkspace(workspaceId: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { userId: null },
  });
}

export async function getEventsBySession(
  sessionId: string,
  options: { limit?: number; offset?: number; after?: string } = {},
) {
  const { limit = 50, offset = 0, after } = options;

  const where: Record<string, unknown> = { sessionId };
  if (after) where.timestamp = { gt: new Date(after) };

  const [rawEvents, total, allEventsForAggregation] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.event.count({ where }),
    // Fetch ALL events (minimal columns) for token aggregation across the full session
    prisma.event.findMany({
      where: { sessionId },
      select: { rawPayload: true },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  // Reverse to chronological order (query fetches newest-first so the latest
  // events are always included, even when total exceeds the limit).
  const events = rawEvents.reverse();

  // Compute token aggregates from ALL events in the session.
  // Prefer authoritative cli_usage from Stop events (set by --output-format json).
  let inputTokens = 0;
  let outputTokens = 0;
  let latestContextTokens = 0;
  let cliCostUsd: number | undefined;
  let hasCliUsage = false;

  for (const evt of allEventsForAggregation) {
    const payload = evt.rawPayload as Record<string, unknown>;
    const cliUsage = payload?.cli_usage as { input_tokens?: number; output_tokens?: number } | undefined;
    if (cliUsage) {
      hasCliUsage = true;
      inputTokens += cliUsage.input_tokens ?? 0;
      outputTokens += cliUsage.output_tokens ?? 0;
      if (typeof payload?.cli_cost_usd === 'number') {
        cliCostUsd = (cliCostUsd ?? 0) + payload.cli_cost_usd;
      }
    }
    // Always use per-call usage for latestContextTokens (context window size),
    // NOT cli_usage which is the cumulative session total.
    const usage = payload?.usage as { input_tokens?: number } | undefined;
    if (usage?.input_tokens) {
      latestContextTokens = usage.input_tokens;
    }
  }

  // Fall back to old dedup logic if no cli_usage found
  if (!hasCliUsage) {
    let prevInputTokens = 0;
    let prevOutputTokens = 0;
    for (const evt of allEventsForAggregation) {
      const usage = (evt.rawPayload as Record<string, unknown>)?.usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (usage) {
        const curInput = usage.input_tokens ?? 0;
        const curOutput = usage.output_tokens ?? 0;
        if (curInput !== prevInputTokens || curOutput !== prevOutputTokens) {
          inputTokens += curInput;
          outputTokens += curOutput;
          prevInputTokens = curInput;
          prevOutputTokens = curOutput;
        }
        if (curInput) {
          latestContextTokens = curInput;
        }
      }
    }
  }

  return {
    events,
    total,
    limit,
    offset,
    tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    latestContextTokens,
    ...(cliCostUsd !== undefined && { cliCostUsd }),
  };
}
