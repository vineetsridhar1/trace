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

async function handleEnrichmentEvent(payload: HookEvent) {
  const stopPayload = payload as Record<string, unknown>;
  const extractedToolName = stopPayload.extracted_tool_name as string | undefined;
  const extractedToolInput = stopPayload.extracted_tool_input;
  const extractedUsage = stopPayload.extracted_usage as { input_tokens: number; output_tokens: number } | undefined;
  const branchName = stopPayload.branch_name as string | undefined;

  // Find the most recent Stop event for this session to update
  const existingEvent = await prisma.event.findFirst({
    where: { sessionId: payload.session_id, hookEventName: 'Stop' },
    orderBy: { timestamp: 'desc' },
    include: { thread: { include: { message: true } } },
  });
  if (!existingEvent) {
    return null;
  }

  const updates: Parameters<typeof prisma.event.update>[0]['data'] = {};

  if (extractedToolName === 'AskUserQuestion' && extractedToolInput && !existingEvent.toolName) {
    updates.toolName = 'AskUserQuestion';
    updates.toolInput = JSON.parse(JSON.stringify(extractedToolInput));
  } else if (extractedToolName === 'ExitPlanMode' && !existingEvent.toolName) {
    updates.toolName = 'ExitPlanMode';
  }

  // Merge usage and branch into rawPayload
  if (extractedUsage || branchName) {
    const rawPayload = (existingEvent.rawPayload as Record<string, unknown>) ?? {};
    if (extractedUsage) rawPayload.usage = extractedUsage;
    if (branchName) rawPayload.branch_name = branchName;
    updates.rawPayload = JSON.parse(JSON.stringify(rawPayload));
  }

  if (Object.keys(updates).length === 0) {
    return { id: existingEvent.id, session_id: payload.session_id };
  }

  const updated = await prisma.event.update({
    where: { id: existingEvent.id },
    data: updates,
  });

  const messageId = existingEvent.thread?.messageId;
  const channelId = existingEvent.thread?.message?.channelId;
  if (!messageId || !channelId) {
    return { id: updated.id, session_id: payload.session_id };
  }

  // Broadcast event update
  pubsub.publish(TOPICS.THREAD_EVENT_UPDATED(channelId), {
    threadEventUpdated: {
      channelId,
      messageId,
      threadId: existingEvent.threadId,
      event: updated,
    },
  });

  // Transition to needs_input if AskUserQuestion/ExitPlanMode was detected
  if (updates.toolName) {
    const currentMsg = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
    if (currentMsg?.status === 'in_progress') {
      await updateMessageStatus(messageId, 'needs_input');
      void syncTicketWithMessageStatus(messageId, channelId, 'needs_input');
      const hydratedMsg = await getMessageByIdForFeed(messageId);
      if (hydratedMsg) {
        pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
          messageUpserted: hydratedMsg,
        });
      }
    }
  }

  // Update branch on message if provided
  if (branchName) {
    await updateMessageSummaryAndBranch(messageId, null, branchName);
    void refreshTicketBroadcast(messageId, channelId);
  }

  return { id: updated.id, session_id: payload.session_id };
}

export async function ingestEvent(payload: HookEvent) {
  // Handle enrichment events: update the existing Stop event rather than
  // creating a duplicate. Enrichment events carry pre-extracted transcript
  // data (tool name, usage, branch) sent by Electron after the initial Stop.
  const source = (payload as Record<string, unknown>).source as string | undefined;
  if (source === 'electron-enrichment') {
    return handleEnrichmentEvent(payload);
  }

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
  // Save Claude session ID on the message for conversation continuity
  // Skip synthetic IDs (trace-local-*) and manual input
  if (payload.session_id !== 'user-manual-input' && !payload.session_id.startsWith('trace-local-')) {
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

  // Auto-transition pending/completed -> in_progress on first non-UserPromptSubmit event
  if ((currentStatus === 'pending' || currentStatus === 'completed') && payload.hook_event_name !== 'UserPromptSubmit') {
    await updateMessageStatus(message.id, 'in_progress');
    void syncTicketWithMessageStatus(message.id, channelId, 'in_progress');
    currentStatus = 'in_progress';
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

    // De-duplicate Stop events: if a Stop event was already created for this
    // thread very recently (e.g. hook Stop followed by synthetic Stop within
    // seconds), merge into the existing event instead of creating a duplicate.
    const recentStop = await prisma.event.findFirst({
      where: {
        threadId: thread.id,
        hookEventName: 'Stop',
        timestamp: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (recentStop) {
      const updates: Record<string, unknown> = {};
      if (eventData.lastAssistantMessage && !recentStop.lastAssistantMessage) {
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

  // Auto-complete / auto-review: if the Stop event has no toolName (Claude is NOT
  // waiting on the user) and the message is still in_progress or auto_review after
  // a delay, handle the transition. Enrichment data may arrive in a follow-up event
  // from Electron, so we wait before auto-completing.
  if (
    payload.hook_event_name === 'Stop' &&
    !eventData.toolName
  ) {
    const autoCompleteSessionId = payload.session_id;
    setTimeout(async () => {
      try {
        const [currentEvent, currentMsg] = await Promise.all([
          prisma.event.findUnique({ where: { id: event.id }, select: { toolName: true } }),
          prisma.message.findUnique({ where: { id: message.id }, select: { status: true, claudeSessionId: true } }),
        ]);
        if (!currentEvent || currentEvent.toolName || !currentMsg || currentMsg.claudeSessionId !== autoCompleteSessionId) {
          return;
        }

        // Check if Claude continued working after this Stop event
        const newerEventCount = await prisma.event.count({
          where: {
            thread: { messageId: message.id },
            sessionId: autoCompleteSessionId,
            timestamp: { gte: event.timestamp },
            id: { not: event.id },
          },
        });
        if (newerEventCount > 0) {
          return;
        }

        // If the review Claude just finished, transition to completed
        if (currentMsg.status === 'auto_review') {
          await updateMessageStatus(message.id, 'completed');
          void syncTicketWithMessageStatus(message.id, channelId, 'completed');
          void checkAndTriggerDependents(message.id, channelId);
          const hydratedMsg = await getMessageByIdForFeed(message.id);
          if (hydratedMsg) {
            pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
              messageUpserted: hydratedMsg,
            });
          }
          return;
        }

        if (currentMsg.status === 'in_progress') {
          // Find the start of the current turn (most recent user prompt) so we only
          // consider writes and tool uses from THIS interaction, not older turns in
          // the same resumed session.
          const lastPrompt = await prisma.event.findFirst({
            where: {
              thread: { messageId: message.id },
              sessionId: autoCompleteSessionId,
              hookEventName: 'UserPromptSubmit',
            },
            orderBy: { timestamp: 'desc' },
            select: { timestamp: true },
          });

          // Check if Claude is waiting for user input (AskUserQuestion/ExitPlanMode
          // in the current turn without a subsequent user response). This catches
          // cases where the PostToolUse event was delayed or status hasn't transitioned yet.
          const pendingInputTool = await prisma.event.findFirst({
            where: {
              thread: { messageId: message.id },
              sessionId: autoCompleteSessionId,
              toolName: { in: ['AskUserQuestion', 'ExitPlanMode'] },
              ...(lastPrompt ? { timestamp: { gt: lastPrompt.timestamp } } : {}),
            },
            orderBy: { timestamp: 'desc' },
          });

          if (pendingInputTool) {
            // Claude is waiting for user input — transition to needs_input, don't auto-review
            await updateMessageStatus(message.id, 'needs_input');
            void syncTicketWithMessageStatus(message.id, channelId, 'needs_input');
            const hydratedMsg = await getMessageByIdForFeed(message.id);
            if (hydratedMsg) {
              pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
                messageUpserted: hydratedMsg,
              });
            }
            return;
          }

          // Check if the current turn made any repo file changes (excluding .claude/ internal files)
          const writeEvents = await prisma.event.findMany({
            where: {
              thread: { messageId: message.id },
              sessionId: autoCompleteSessionId,
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

          if (repoWriteCount > 0) {
            // File changes detected — trigger auto-review
            await updateMessageStatus(message.id, 'auto_review');
            void syncTicketWithMessageStatus(message.id, channelId, 'auto_review');

            // Create a synthetic AutoReview event in the thread
            const reviewEvent = await prisma.event.create({
              data: {
                sessionId: eventData.sessionId,
                threadId: eventData.threadId,
                hookEventName: 'AutoReview',
                importance: 'important',
                timestamp: new Date(),
                rawPayload: {},
              },
            });

            // Broadcast the review event and updated message status
            pubsub.publish(TOPICS.THREAD_EVENT_CREATED(channelId), {
              threadEventCreated: { channelId, messageId: message.id, threadId: eventData.threadId, event: reviewEvent },
            });
            const hydratedMsg = await getMessageByIdForFeed(message.id);
            if (hydratedMsg) {
              pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
                messageUpserted: hydratedMsg,
              });
            }

            // Publish subscription to trigger client-side Claude spawn
            pubsub.publish(TOPICS.MESSAGE_READY_FOR_REVIEW(channelId), {
              messageReadyForReview: {
                channelId,
                messageId: message.id,
                claudeSessionId: currentMsg.claudeSessionId,
              },
            });
          } else {
            // No file changes — complete directly
            await updateMessageStatus(message.id, 'completed');
            void syncTicketWithMessageStatus(message.id, channelId, 'completed');
            void checkAndTriggerDependents(message.id, channelId);
            const hydratedMsg = await getMessageByIdForFeed(message.id);
            if (hydratedMsg) {
              pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
                messageUpserted: hydratedMsg,
              });
            }
          }
        }
      } catch {
        // Silent failure — status will remain as-is
      }
    }, 5000);
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
