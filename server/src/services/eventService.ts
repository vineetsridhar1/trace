import fs from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma';
import { HookEvent } from '../types/hookEvents';
import { sseManager } from './sseManager';
import {
  getMessageByIdForFeed,
  getMessageByIdWithThreads,
  updateMessagePreviewAndImportance,
  updateMessageStatus,
} from './messageService';

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
      if (!message?.content || !Array.isArray(message.content)) continue;

      for (const block of message.content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && b.name === 'AskUserQuestion') {
          const input = b.input as Record<string, unknown> | undefined;
          if (input?.questions && Array.isArray(input.questions) && input.questions.length > 0) {
            return { questions: input.questions };
          }
        }
      }
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
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
  const channelId = message.channelId;
  const thread =
    message.threads[0] ??
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
        sseManager.broadcast(payload.session_id, 'session-update', session);
        return { id: existingPromptEvent.id, session_id: session.sessionId };
      }
    }
  }

  // Auto-transition pending -> in_progress on first non-UserPromptSubmit event
  if (message.status === 'pending' && payload.hook_event_name !== 'UserPromptSubmit') {
    await updateMessageStatus(message.id, 'in_progress');
  }

  // Compute importance
  const importance =
    payload.hook_event_name === 'UserPromptSubmit' || payload.hook_event_name === 'Stop'
      ? 'important'
      : 'non-important';

  // Build event data
  const eventData: Parameters<typeof prisma.event.create>[0]['data'] = {
    sessionId: payload.session_id,
    hookEventName: payload.hook_event_name,
    rawPayload: JSON.parse(JSON.stringify(payload)),
    threadId: thread.id,
    importance,
  };

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
      }
    }
  }

  const event = await prisma.event.create({ data: eventData });

  // Update message preview and importance
  const preview =
    payload.hook_event_name === 'Stop' && payload.last_assistant_message
      ? payload.last_assistant_message.slice(0, 200)
      : payload.hook_event_name === 'UserPromptSubmit'
        ? extractPromptFromPayload(payload)?.slice(0, 200) ?? null
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

  const hydratedMessage = await getMessageByIdForFeed(message.id);

  // Broadcast via SSE
  sseManager.broadcast(payload.session_id, 'new-event', event);
  sseManager.broadcast(payload.session_id, 'session-update', session);
  sseManager.broadcastChannel(channelId, 'new-event', event);
  sseManager.broadcastChannel(channelId, 'thread-event-created', {
    channelId,
    messageId: message.id,
    threadId: thread.id,
    event,
  });
  if (hydratedMessage) {
    sseManager.broadcastChannel(channelId, 'message-upsert', {
      channelId,
      message: hydratedMessage,
    });
  }
  sseManager.broadcastChannel(channelId, 'message-update', { messageId: message.id, channelId });

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

  return { events, total, limit, offset };
}
