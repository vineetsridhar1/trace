import fs from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma';
import { HookEvent } from '../types/hookEvents';
import { pubsub, TOPICS } from './pubsub';
import { execSync } from 'node:child_process';
import {
  getMessageByIdForFeed,
  getMessageByIdWithThreads,
  updateMessagePreviewAndImportance,
  updateMessageStatus,
  updateMessageSummaryAndBranch,
} from './messageService';
import { updateTicketFromEvent, syncTicketWithMessageStatus, refreshTicketBroadcast } from './ticketService';

function extractMessageIdFromWorktreePath(worktreePath: string | undefined): string | null {
  if (!worktreePath) {
    return null;
  }

  const normalized = path.normalize(worktreePath);
  const segments = normalized.split(path.sep).filter(Boolean);
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

const TAIL_BYTES = 32_768; // 32 KB — enough for the last few JSONL entries

export function extractUsageFromTranscript(
  transcriptPath: string,
): { input_tokens: number; output_tokens: number } | null {
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      const readFrom = Math.max(0, stat.size - TAIL_BYTES);
      const buf = Buffer.alloc(Math.min(stat.size, TAIL_BYTES));
      fs.readSync(fd, buf, 0, buf.length, readFrom);
      const tail = buf.toString('utf-8');

      // Split into lines; first line may be partial so we skip it when reading from mid-file
      const lines = tail.split('\n');
      if (readFrom > 0) lines.shift();

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        const entry = parsed as Record<string, unknown>;
        if (entry.type !== 'assistant') continue;

        const message = entry.message as Record<string, unknown> | undefined;
        const usage = message?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (usage?.input_tokens) {
          return {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens ?? 0,
          };
        }

        // Only check the most recent assistant message.
        return null;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
}

export function extractAskUserQuestionFromTranscript(
  transcriptPath: string,
): { questions: unknown[] } | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const entry = parsed as Record<string, unknown>;
      if (entry.type !== 'assistant') continue;

      const message = entry.message as Record<string, unknown> | undefined;
      if (!message?.content || !Array.isArray(message.content)) {
        // Most recent assistant message has no parseable content — stop searching.
        return null;
      }

      for (const block of message.content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && b.name === 'AskUserQuestion') {
          const input = b.input as Record<string, unknown> | undefined;
          if (input?.questions && Array.isArray(input.questions) && input.questions.length > 0) {
            return { questions: input.questions };
          }
        }
      }

      // Most recent assistant message didn't contain AskUserQuestion — don't
      // search older messages which would return stale question data.
      return null;
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
}

export function extractExitPlanModeFromTranscript(
  transcriptPath: string,
): { input: unknown } | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const entry = parsed as Record<string, unknown>;
      if (entry.type !== 'assistant') continue;

      const message = entry.message as Record<string, unknown> | undefined;
      if (!message?.content || !Array.isArray(message.content)) {
        return null;
      }

      for (const block of message.content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && b.name === 'ExitPlanMode') {
          return { input: b.input };
        }
      }

      // Most recent assistant message didn't contain ExitPlanMode — don't
      // search older messages which would return stale data.
      return null;
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
}

function resolveGitBranch(cwd: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      timeout: 3000,
      encoding: 'utf-8',
    }).trim() || null;
  } catch {
    return null;
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

  // Auto-transition pending -> in_progress on first non-UserPromptSubmit event
  if (currentStatus === 'pending' && payload.hook_event_name !== 'UserPromptSubmit') {
    await updateMessageStatus(message.id, 'in_progress');
    void syncTicketWithMessageStatus(message.id, channelId, 'in_progress');
    currentStatus = 'in_progress';
  }

  // Auto-transition needs_input -> in_progress when user responds
  if (currentStatus === 'needs_input' && payload.hook_event_name === 'UserPromptSubmit') {
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

  // Extract context usage from transcript for every event type
  if (payload.transcript_path) {
    const usage = extractUsageFromTranscript(payload.transcript_path);
    if (usage) {
      rawPayload.usage = usage;
    }
  }

  if (payload.hook_event_name === 'PostToolUse') {
    eventData.toolName = payload.tool_name;
    eventData.toolInput = payload.tool_input ? JSON.parse(JSON.stringify(payload.tool_input)) : undefined;
    eventData.toolResponse = payload.tool_response ? JSON.parse(JSON.stringify(payload.tool_response)) : undefined;
    eventData.toolUseId = payload.tool_use_id;
  }

  if (payload.hook_event_name === 'Stop') {
    eventData.stopHookActive = payload.stop_hook_active;
    eventData.lastAssistantMessage = payload.last_assistant_message;

    if (payload.transcript_path) {
      const askData = extractAskUserQuestionFromTranscript(payload.transcript_path);
      if (askData) {
        eventData.toolName = 'AskUserQuestion';
        eventData.toolInput = JSON.parse(JSON.stringify(askData));
      } else {
        const exitPlanData = extractExitPlanModeFromTranscript(payload.transcript_path);
        if (exitPlanData) {
          eventData.toolName = 'ExitPlanMode';
        }
      }
    }
  }

  const event = await prisma.event.create({ data: eventData });

  // Auto-transition in_progress -> needs_input when AskUserQuestion is detected
  if (eventData.toolName === 'AskUserQuestion' && currentStatus === 'in_progress') {
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
  // Branch is only resolved on Stop events to avoid a race condition: earlier
  // events (e.g. UserPromptSubmit) fire before Claude has renamed the branch,
  // so resolving then would capture the hash-based default name. By waiting
  // for Stop, the branch rename is guaranteed to have completed.
  const summaryText =
    payload.hook_event_name === 'Stop' && payload.last_assistant_message
      ? payload.last_assistant_message.slice(0, 500)
      : null;
  const branchName =
    payload.cwd && payload.hook_event_name === 'Stop'
      ? resolveGitBranch(payload.cwd)
      : null;

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

  // Schedule a delayed retry when the transcript wasn't ready at ingestion time.
  // The Claude Code SDK may write the assistant message (containing AskUserQuestion
  // or ExitPlanMode tool_use) to the transcript AFTER firing the Stop hook.
  if (
    payload.hook_event_name === 'Stop' &&
    !eventData.toolName &&
    payload.transcript_path
  ) {
    const transcriptPath = payload.transcript_path;
    const eventId = event.id;
    const retryEnrichment = async () => {
      try {
        // Skip if already enriched by a prior retry
        const current = await prisma.event.findUnique({ where: { id: eventId }, select: { toolName: true } });
        if (current?.toolName) return;

        const askData = extractAskUserQuestionFromTranscript(transcriptPath);
        if (askData) {
          const updated = await prisma.event.update({
            where: { id: eventId },
            data: {
              toolName: 'AskUserQuestion',
              toolInput: JSON.parse(JSON.stringify(askData)),
            },
          });
          pubsub.publish(TOPICS.THREAD_EVENT_UPDATED(channelId), {
            threadEventUpdated: {
              channelId,
              messageId: message.id,
              threadId: thread.id,
              event: updated,
            },
          });
          // Auto-transition to needs_input on delayed AskUserQuestion detection
          const currentMsg = await prisma.message.findUnique({ where: { id: message.id }, select: { status: true } });
          if (currentMsg?.status === 'in_progress') {
            await updateMessageStatus(message.id, 'needs_input');
            void syncTicketWithMessageStatus(message.id, channelId, 'needs_input');
            const hydratedMsg = await getMessageByIdForFeed(message.id);
            if (hydratedMsg) {
              pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
                messageUpserted: hydratedMsg,
              });
            }
          }
          return;
        }
        const exitPlanData = extractExitPlanModeFromTranscript(transcriptPath);
        if (exitPlanData) {
          const updated = await prisma.event.update({
            where: { id: eventId },
            data: { toolName: 'ExitPlanMode' },
          });
          pubsub.publish(TOPICS.THREAD_EVENT_UPDATED(channelId), {
            threadEventUpdated: {
              channelId,
              messageId: message.id,
              threadId: thread.id,
              event: updated,
            },
          });
        }
      } catch {
        // Silent failure — lazy enrichment on fetch will still work as fallback
      }
    };
    setTimeout(() => void retryEnrichment(), 1500);
    setTimeout(() => void retryEnrichment(), 4000);
  }

  return { id: event.id, session_id: session.sessionId };
}

export async function updateStopEventUsage(
  messageId: string,
  cliUsage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number },
  cliCostUsd?: number,
) {
  const message = await getMessageByIdWithThreads(messageId);
  if (!message) return null;

  const latestThread = message.threads[message.threads.length - 1];
  if (!latestThread) return null;

  // Find the latest Stop event in this thread
  const stopEvent = await prisma.event.findFirst({
    where: { threadId: latestThread.id, hookEventName: 'Stop' },
    orderBy: { timestamp: 'desc' },
  });
  if (!stopEvent) return null;

  // Merge cli_usage and cli_cost_usd into rawPayload
  const rawPayload = (stopEvent.rawPayload as Record<string, unknown>) ?? {};
  rawPayload.cli_usage = cliUsage;
  if (cliCostUsd !== undefined) {
    rawPayload.cli_cost_usd = cliCostUsd;
  }

  const updated = await prisma.event.update({
    where: { id: stopEvent.id },
    data: { rawPayload: JSON.parse(JSON.stringify(rawPayload)) },
  });

  // Broadcast so the client picks up the merged usage data
  const channelId = message.channelId;
  pubsub.publish(TOPICS.THREAD_EVENT_UPDATED(channelId), {
    threadEventUpdated: {
      channelId,
      messageId: message.id,
      threadId: latestThread.id,
      event: updated,
    },
  });

  return updated;
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
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    latestContextTokens: 0,
  };
}
