import prisma from '../lib/prisma';
import { HookEvent } from '../types/hookEvents';
import { sseManager } from './sseManager';

export async function ingestEvent(payload: HookEvent) {
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

  // Build event data
  const eventData: Parameters<typeof prisma.event.create>[0]['data'] = {
    sessionId: payload.session_id,
    hookEventName: payload.hook_event_name,
    rawPayload: JSON.parse(JSON.stringify(payload)),
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
  }

  const event = await prisma.event.create({ data: eventData });

  // Broadcast via SSE
  sseManager.broadcast(payload.session_id, 'new-event', event);
  sseManager.broadcast(payload.session_id, 'session-update', session);

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
