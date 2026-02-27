import prisma from '../lib/prisma';
import { HookEvent } from '../types/hookEvents';
import { pubsub, TOPICS } from './pubsub';
import {
  getMessageByIdForFeed,
  getMessageByIdWithThreads,
  updateMessagePreviewAndImportance,
  updateMessageStatus,
  updateMessageSummaryAndBranch,
} from './messageService';
import { updateTicketFromEvent, syncTicketWithMessageStatus, refreshTicketBroadcast, checkAndTriggerDependents } from './ticketService';

function extractMessageIdFromWorktreePath(worktreePath: string | undefined): string | null {
  if (!worktreePath) {
    return null;
  }

  // Normalize path separators to handle both unix and windows-style paths
  const segments = worktreePath.replace(/\\/g, '/').split('/').filter(Boolean);
  // Look for the "worktrees" marker (supports both old .trace-worktrees and new app-data location)
  let markerIndex = segments.lastIndexOf('worktrees');
  if (markerIndex === -1) {
    markerIndex = segments.lastIndexOf('.trace-worktrees');
  }

  if (markerIndex === -1 || markerIndex + 1 >= segments.length) {
    return null;
  }

  return segments[markerIndex + 1] ?? null;
}

function stripTraceInternal(text: string): string {
  return text.replace(/<trace-internal>[\s\S]*?<\/trace-internal>\s*/g, '');
}

function extractPromptFromPayload(payload: HookEvent): string | null {
  const raw = payload as unknown as Record<string, unknown>;
  const candidates = ['prompt', 'text', 'message', 'user_prompt'];

  for (const key of candidates) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function extractPromptFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return null;
  }

  const raw = rawPayload as Record<string, unknown>;
  const candidates = ['prompt', 'text', 'message', 'user_prompt'];

  for (const key of candidates) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

/**
 * Run auto-complete / auto-review logic when a Stop event arrives without a
 * toolName (Claude is NOT waiting on user input). Determines the final status
 * by checking if the current turn made repo file changes.
 *
 * Safe to call multiple times — checks current DB status and only acts when
 * the message is still `in_progress` or `auto_review`.
 */
async function runAutoCompleteIfNeeded(
  messageId: string,
  channelId: string,
  sessionId: string,
  threadId: string,
  toolName: string | null | undefined,
  /** When true, skip the auto_review→completed transition. Used by the dedup
   *  path to avoid prematurely completing a message before the review Claude
   *  has even started — the review Claude will fire its own Stop event. */
  skipReviewTransition = false,
): Promise<void> {
  if (toolName) return; // Claude is waiting on user input

  // Re-read current status from DB to avoid stale data from earlier in the request
  const freshMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { status: true },
  });
  const currentStatus = freshMessage?.status ?? 'pending';

  if (currentStatus === 'in_progress') {
    // Find the start of the current turn (most recent user prompt) so we only
    // consider writes from THIS interaction, not older turns in a resumed session.
    const lastPrompt = await prisma.event.findFirst({
      where: {
        thread: { messageId },
        sessionId,
        hookEventName: 'UserPromptSubmit',
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    // Check if the current turn made any repo file changes (excluding .claude/ internal files)
    const writeEvents = await prisma.event.findMany({
      where: {
        thread: { messageId },
        sessionId,
        hookEventName: 'PostToolUse',
        toolName: { in: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'write', 'edit', 'multiedit', 'notebookedit'] },
        ...(lastPrompt ? { timestamp: { gte: lastPrompt.timestamp } } : {}),
      },
      select: { toolInput: true },
    });

    const repoWriteCount = writeEvents.filter((e: { toolInput: unknown }) => {
      if (!e.toolInput || typeof e.toolInput !== 'object') return true;
      const input = e.toolInput as Record<string, unknown>;
      const filePath = (input.file_path ?? input.path ?? input.filepath ?? '') as string;
      return !filePath.includes('/.claude/');
    }).length;

    console.log(`[event] auto-complete: writes=${writeEvents.length} repoWrites=${repoWriteCount} msg=${messageId.slice(0, 8)}`);

    if (repoWriteCount > 0) {
      await updateMessageStatus(messageId, 'auto_review');
      void syncTicketWithMessageStatus(messageId, channelId, 'auto_review');

      const reviewEvent = await prisma.event.create({
        data: {
          sessionId,
          threadId,
          hookEventName: 'AutoReview',
          importance: 'important',
          timestamp: new Date(),
          rawPayload: {},
        },
      });

      pubsub.publish(TOPICS.THREAD_EVENT_CREATED(channelId), {
        threadEventCreated: { channelId, messageId, threadId, event: reviewEvent },
      });

      pubsub.publish(TOPICS.MESSAGE_READY_FOR_REVIEW(channelId), {
        messageReadyForReview: {
          channelId,
          messageId,
          claudeSessionId: sessionId,
        },
      });
    } else {
      await updateMessageStatus(messageId, 'completed');
      void syncTicketWithMessageStatus(messageId, channelId, 'completed');
      void checkAndTriggerDependents(messageId, channelId);
    }

    const newStatus = repoWriteCount > 0 ? 'auto_review' : 'completed';
    console.log(`[event] status: ${currentStatus} -> ${newStatus} msg=${messageId.slice(0, 8)}`);
  }

  if (currentStatus === 'auto_review' && !skipReviewTransition) {
    await updateMessageStatus(messageId, 'completed');
    void syncTicketWithMessageStatus(messageId, channelId, 'completed');
    void checkAndTriggerDependents(messageId, channelId);
    console.log(`[event] status: auto_review -> completed msg=${messageId.slice(0, 8)}`);
  }

  // Broadcast the final message status to the frontend
  if (currentStatus === 'in_progress' || currentStatus === 'auto_review') {
    const finalMessage = await getMessageByIdForFeed(messageId);
    if (finalMessage) {
      pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
        messageUpserted: finalMessage,
      });
    }
  }
}

export async function ingestEvent(payload: HookEvent) {
  // Resolve target message from worktree path. If the session wasn't spawned
  // by the app (no worktree path), silently drop the event so external CLI
  // sessions don't pollute #general.
  const messageIdFromCwd = extractMessageIdFromWorktreePath(payload.cwd);
  const messageIdFromTranscript = extractMessageIdFromWorktreePath(payload.transcript_path);
  const resolvedMessageId = messageIdFromCwd ?? messageIdFromTranscript;
  const message = resolvedMessageId
    ? await getMessageByIdWithThreads(resolvedMessageId)
    : null;
  if (!message) {
    console.log(`[event] DROPPED ${payload.hook_event_name} — no message found (cwd=${payload.cwd?.slice(-40)} resolvedId=${resolvedMessageId})`);
    return null;
  }

  // Upsert session
  const session = await prisma.session.upsert({
    where: { sessionId: payload.session_id },
    create: {
      sessionId: payload.session_id,
      transcriptPath: payload.transcript_path,
      cwd: payload.cwd,
      permissionMode: payload.permission_mode,
      status: 'active',
    },
    update: {
      lastSeenAt: new Date(),
      ...(payload.hook_event_name === 'Stop' ? { status: 'stopped' } : {}),
      ...(payload.transcript_path ? { transcriptPath: payload.transcript_path } : {}),
      ...(payload.cwd ? { cwd: payload.cwd } : {}),
      ...(payload.permission_mode ? { permissionMode: payload.permission_mode } : {}),
    },
  });
  // Save Claude session ID on the message for conversation continuity.
  // Skip manual input (UI-created events) but allow trace-local-* IDs so
  // the inline auto-complete check can match them when Claude exits before
  // producing a real session ID (e.g. immediate crash or early exit).
  if (payload.session_id !== 'user-manual-input') {
    await prisma.message.update({
      where: { id: message.id },
      data: { claudeSessionId: payload.session_id },
    });
  }

  const channelId = message.channelId;
  let currentStatus = message.status;
  const thread =
    message.threads[message.threads.length - 1] ??
    (await prisma.thread.create({
      data: { messageId: message.id },
    }));

  // De-duplicate hook prompt events when we've already persisted the exact
  // prompt from the UI before spawning Claude.
  if (payload.hook_event_name === 'UserPromptSubmit') {
    const rawIncoming = extractPromptFromPayload(payload)?.trim() ?? null;
    // Strip <trace-internal> blocks so the injected branch-rename instruction
    // doesn't prevent dedup against the clean prompt already persisted by the UI.
    const incomingPrompt = rawIncoming ? stripTraceInternal(rawIncoming).trim() : null;
    if (incomingPrompt) {
      const existingPromptEvent = await prisma.event.findFirst({
        where: {
          threadId: thread.id,
          hookEventName: 'UserPromptSubmit',
          timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        orderBy: { timestamp: 'desc' },
      });

      const existingPrompt = existingPromptEvent
        ? extractPromptFromRawPayload(existingPromptEvent.rawPayload)
        : null;

      if (existingPromptEvent && existingPrompt && existingPrompt === incomingPrompt) {
        return { id: existingPromptEvent.id, session_id: session.sessionId };
      }
    }
  }

  // Auto-transition pending -> in_progress on first non-UserPromptSubmit event.
  if (currentStatus === 'pending' && payload.hook_event_name !== 'UserPromptSubmit') {
    await updateMessageStatus(message.id, 'in_progress');
    void syncTicketWithMessageStatus(message.id, channelId, 'in_progress');
    currentStatus = 'in_progress';
  }

  // Auto-transition completed -> in_progress only when a NEW prompt was submitted
  // after the last Stop in this thread. This prevents stale late-arriving hook
  // events from reopening a message that was already completed.
  if (
    currentStatus === 'completed' &&
    payload.hook_event_name !== 'UserPromptSubmit' &&
    payload.hook_event_name !== 'Stop'
  ) {
    const [latestPrompt, latestStop] = await Promise.all([
      prisma.event.findFirst({
        where: {
          threadId: thread.id,
          hookEventName: 'UserPromptSubmit',
        },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.event.findFirst({
        where: {
          threadId: thread.id,
          hookEventName: 'Stop',
        },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    const hasNewPromptSinceLastStop = !!latestPrompt && (!latestStop || latestPrompt.timestamp > latestStop.timestamp);
    if (hasNewPromptSinceLastStop) {
      await updateMessageStatus(message.id, 'in_progress');
      void syncTicketWithMessageStatus(message.id, channelId, 'in_progress');
      currentStatus = 'in_progress';
    }
  }

  // Auto-transition needs_input -> in_progress when user responds or Claude continues.
  // UserPromptSubmit is the expected trigger, but any non-input-requesting event also
  // means the user already responded and Claude is working again.
  if (currentStatus === 'needs_input' && payload.hook_event_name !== 'Stop') {
    await updateMessageStatus(message.id, 'in_progress');
    void syncTicketWithMessageStatus(message.id, channelId, 'in_progress');
    currentStatus = 'in_progress';
  }

  // Compute importance
  const importance =
    payload.hook_event_name === 'UserPromptSubmit' || payload.hook_event_name === 'Stop'
      ? 'important'
      : 'non-important';

  // Build event data
  const rawPayload = JSON.parse(JSON.stringify(payload));

  const eventData: Parameters<typeof prisma.event.create>[0]['data'] = {
    sessionId: payload.session_id,
    hookEventName: payload.hook_event_name,
    rawPayload,
    threadId: thread.id,
    importance,
  };

  // Use pre-extracted data from Electron for Stop events.
  // All enrichment fields (usage, tool name, branch) are read from a single cast.
  let stopBranchName: string | null = null;
  if (payload.hook_event_name === 'Stop') {
    const stopPayload = payload as Record<string, unknown>;
    eventData.stopHookActive = payload.stop_hook_active;
    eventData.lastAssistantMessage = payload.last_assistant_message;

    const extractedUsage = stopPayload.extracted_usage as { input_tokens: number; output_tokens: number } | undefined;
    if (extractedUsage) {
      rawPayload.usage = extractedUsage;
    }

    const extractedToolName = stopPayload.extracted_tool_name as string | undefined;
    const extractedToolInput = stopPayload.extracted_tool_input;

    if (extractedToolName === 'AskUserQuestion' && extractedToolInput) {
      eventData.toolName = 'AskUserQuestion';
      eventData.toolInput = JSON.parse(JSON.stringify(extractedToolInput));
    } else if (extractedToolName === 'ExitPlanMode') {
      eventData.toolName = 'ExitPlanMode';
    }

    stopBranchName = (stopPayload.branch_name as string | undefined) ?? null;

    // De-duplicate Stop events: if a Stop event from the SAME session was
    // already created very recently, merge into it instead of creating a
    // duplicate. This guards against edge cases where multiple Stop signals
    // arrive for one run. The sessionId filter ensures a new Claude run on
    // the same message isn't incorrectly deduped against the previous run.
    // Scope dedupe to the current turn. Claude session IDs are reused across
    // turns, so a plain session+time window can accidentally match the
    // previous turn's Stop when runs happen close together.
    const latestPrompt = await prisma.event.findFirst({
      where: {
        threadId: thread.id,
        hookEventName: 'UserPromptSubmit',
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    const dedupeWindowStart = new Date(Date.now() - 60_000);
    const turnWindowStart =
      latestPrompt && latestPrompt.timestamp > dedupeWindowStart
        ? latestPrompt.timestamp
        : dedupeWindowStart;

    const recentStop = await prisma.event.findFirst({
      where: {
        threadId: thread.id,
        sessionId: payload.session_id,
        hookEventName: 'Stop',
        timestamp: { gte: turnWindowStart },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (recentStop) {
      console.log(`[event] Stop DEDUPED msg=${message.id.slice(0, 8)} session=${payload.session_id.slice(0, 8)} existingId=${recentStop.id.slice(0, 8)} age=${Date.now() - recentStop.timestamp.getTime()}ms`);
      const updates: Record<string, unknown> = {};
      // Prefer newer enriched Stop text from the close handler.
      if (
        typeof eventData.lastAssistantMessage === 'string' &&
        eventData.lastAssistantMessage.trim().length > 0 &&
        eventData.lastAssistantMessage !== recentStop.lastAssistantMessage
      ) {
        updates.lastAssistantMessage = eventData.lastAssistantMessage;
      }
      if (eventData.toolName && !recentStop.toolName) {
        updates.toolName = eventData.toolName;
        if (eventData.toolInput) updates.toolInput = eventData.toolInput;
      }
      // Merge rawPayload (enrichment data like usage, branch)
      const mergedRaw = { ...(recentStop.rawPayload as Record<string, unknown> ?? {}), ...rawPayload };
      updates.rawPayload = mergedRaw;

      if (Object.keys(updates).length > 0) {
        await prisma.event.update({ where: { id: recentStop.id }, data: updates });
      }

      // Broadcast the updated event so the UI picks up merged data
      pubsub.publish(TOPICS.THREAD_EVENT_UPDATED(channelId), {
        threadEventUpdated: {
          channelId,
          messageId: message.id,
          threadId: thread.id,
          event: { ...recentStop, ...updates },
        },
      });

      // Update summary/branch from the enriched Stop data (the first Stop from
      // hooks typically lacks branch_name and last_assistant_message).
      if (stopBranchName || eventData.lastAssistantMessage) {
        const summaryText = typeof eventData.lastAssistantMessage === 'string'
          ? eventData.lastAssistantMessage.slice(0, 500)
          : null;
        await updateMessageSummaryAndBranch(message.id, summaryText, stopBranchName);
        if (stopBranchName) {
          void refreshTicketBroadcast(message.id, channelId);
        }
      }

      // Run auto-complete even on the deduped Stop. The first Stop (from hooks)
      // may have arrived before all PostToolUse events were persisted. This
      // second Stop (from the close handler, after waitForPendingPosts) has all
      // data available. runAutoCompleteIfNeeded re-reads status from DB and is
      // a no-op if the first Stop already transitioned the status.
      const mergedToolName = (updates.toolName ?? recentStop.toolName) as string | null;
      await runAutoCompleteIfNeeded(message.id, channelId, payload.session_id, thread.id, mergedToolName, /* skipReviewTransition */ true);

      // Always re-broadcast the hydrated message on deduped Stop so the UI
      // receives final session/status/summary updates even when status is
      // unchanged (e.g. duplicate Stop after completion).
      const hydratedMessage = await getMessageByIdForFeed(message.id);
      if (hydratedMessage) {
        pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
          messageUpserted: hydratedMessage,
        });
      }

      return { id: recentStop.id, session_id: session.sessionId };
    }
  }

  if (payload.hook_event_name === 'PreToolUse') {
    eventData.toolName = payload.tool_name;
    eventData.toolInput = payload.tool_input ? JSON.parse(JSON.stringify(payload.tool_input)) : undefined;
    eventData.toolUseId = payload.tool_use_id;
  }

  if (payload.hook_event_name === 'PostToolUse') {
    eventData.toolName = payload.tool_name;
    eventData.toolInput = payload.tool_input ? JSON.parse(JSON.stringify(payload.tool_input)) : undefined;
    eventData.toolResponse = payload.tool_response ? JSON.parse(JSON.stringify(payload.tool_response)) : undefined;
    eventData.toolUseId = payload.tool_use_id;
  }

  const event = await prisma.event.create({ data: eventData });
  console.log(`[event] ${payload.hook_event_name}${eventData.toolName ? ':' + eventData.toolName : ''} msg=${message.id.slice(0, 8)} session=${payload.session_id.slice(0, 8)} status=${currentStatus}`);

  // Auto-transition in_progress/auto_review -> needs_input when AskUserQuestion or ExitPlanMode is detected
  if ((eventData.toolName === 'AskUserQuestion' || eventData.toolName === 'ExitPlanMode') && (currentStatus === 'in_progress' || currentStatus === 'auto_review')) {
    await updateMessageStatus(message.id, 'needs_input');
    void syncTicketWithMessageStatus(message.id, channelId, 'needs_input');
    currentStatus = 'needs_input';
  }

  // Update message preview and importance
  const preview =
    payload.hook_event_name === 'Stop' && payload.last_assistant_message
      ? payload.last_assistant_message.slice(0, 200)
      : payload.hook_event_name === 'UserPromptSubmit'
        ? (() => { const p = extractPromptFromPayload(payload); return p ? stripTraceInternal(p).slice(0, 200) : null; })()
        : null;

  // Only set the preview once (first message), so the thread preview shows the
  // initial prompt rather than the latest assistant response.
  const shouldSetPreview = preview && !message.preview;

  if (shouldSetPreview || importance === 'important') {
    await updateMessagePreviewAndImportance(
      message.id,
      shouldSetPreview ? preview : null,
      importance === 'important' ? 'important' : message.importance,
    );
  }

  // Update summary and branch.
  const summaryText =
    payload.hook_event_name === 'Stop' && payload.last_assistant_message
      ? payload.last_assistant_message.slice(0, 500)
      : null;
  const branchName = stopBranchName;

  if (summaryText || branchName) {
    await updateMessageSummaryAndBranch(message.id, summaryText, branchName);
  }

  // Re-broadcast the ticket immediately so the board view picks up the
  // updated message.branch without waiting for the AI-powered ticket update.
  if (branchName) {
    void refreshTicketBroadcast(message.id, channelId);
  }

  // Update kanban ticket on Stop events
  if (payload.hook_event_name === 'Stop' && payload.last_assistant_message) {
    void updateTicketFromEvent(
      message.id,
      channelId,
      payload.last_assistant_message.slice(0, 1000),
      summaryText ?? '',
    );
  }

  const hydratedMessage = await getMessageByIdForFeed(message.id);

  // Broadcast via GraphQL subscriptions
  pubsub.publish(TOPICS.THREAD_EVENT_CREATED(channelId), {
    threadEventCreated: { channelId, messageId: message.id, threadId: thread.id, event },
  });
  if (hydratedMessage) {
    pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
      messageUpserted: hydratedMessage,
    });
  }

  // Auto-complete / auto-review: determine the final message status when
  // Claude stops without requesting user input.
  if (payload.hook_event_name === 'Stop') {
    await runAutoCompleteIfNeeded(message.id, channelId, payload.session_id, thread.id, eventData.toolName);
  }

  return { id: event.id, session_id: session.sessionId };
}

export async function getEventById(id: string) {
  return prisma.event.findUnique({ where: { id } });
}

export async function getEventsBySession(
  sessionId: string,
  options: {
    hookEventName?: string;
    toolName?: string;
    limit?: number;
    offset?: number;
    after?: string;
  } = {},
) {
  const { hookEventName, toolName, limit = 50, offset = 0, after } = options;

  const where: Record<string, unknown> = { sessionId };
  if (hookEventName) where.hookEventName = hookEventName;
  if (toolName) where.toolName = toolName;
  if (after) where.timestamp = { gt: new Date(after) };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

  return {
    events,
    total,
    limit,
    offset,
  };
}
