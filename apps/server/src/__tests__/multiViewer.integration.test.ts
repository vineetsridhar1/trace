import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  });
  return {
    workspace: model(), session: model(), event: model(), cliSession: model(),
    channel: model(), server: model(), user: model(), ticket: model(),
    kanbanColumn: model(), attachment: model(), $transaction: vi.fn(),
  };
});

vi.mock('../lib/prisma', () => ({ default: mockPrisma }));

vi.mock('../services/storageService', () => ({
  initStorage: vi.fn(),
  getStorage: vi.fn(() => ({
    url: (key: string) => `/attachments/file/${key}`,
    localPath: (key: string) => `/tmp/${key}`,
  })),
}));

vi.mock('../services/ticketService', () => ({
  updateTicketFromEvent: vi.fn(),
  syncTicketWithWorkspaceStatus: vi.fn(),
  refreshTicketBroadcast: vi.fn(),
  checkAndTriggerDependents: vi.fn(),
  triggerReviewIfAutonomous: vi.fn(),
}));

import { pubsub, TOPICS } from '../services/pubsub';
import { ingestEvent } from '../services/eventService';
import type { HookEvent } from '../types/hookEvents';

describe('Multi-Viewer Integration (PubSub fan-out)', () => {
  const WORKSPACE_ID = 'ws-multi-001';
  const CLI_SESSION_ID = 'sess-multi-abc';
  const SESSION_ID = 'session-multi-001';
  const CHANNEL_ID = 'chan-multi-001';

  const subscriptionIds: number[] = [];

  function makeWorkspace(overrides: Record<string, unknown> = {}) {
    return {
      id: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      cliSessionId: CLI_SESSION_ID,
      preview: null,
      importance: 'non-important',
      status: 'pending',
      summary: null,
      branch: null,
      userId: null,
      sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID, createdAt: new Date() }],
      ...overrides,
    };
  }

  function makeFeedWorkspace(overrides: Record<string, unknown> = {}) {
    return {
      ...makeWorkspace(overrides),
      cliSession: { sessionId: CLI_SESSION_ID, cwd: '/test', status: 'active' },
      user: null,
      _count: { sessions: 1 },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.cliSession.upsert.mockResolvedValue({
      sessionId: CLI_SESSION_ID, cwd: '/test', status: 'active',
    });
    mockPrisma.workspace.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      return makeWorkspace(args.data);
    });
    mockPrisma.event.create.mockImplementation(async (args: { data: { hookEventName: string } }) => ({
      id: `evt-${Date.now()}`,
      ...args.data,
      timestamp: new Date(),
    }));
    mockPrisma.event.count.mockResolvedValue(0);
    mockPrisma.event.findFirst.mockResolvedValue(null);
    mockPrisma.event.findMany.mockResolvedValue([]);
  });

  afterEach(async () => {
    for (const id of subscriptionIds) {
      await pubsub.unsubscribe(id);
    }
    subscriptionIds.length = 0;
  });

  async function subscribe(topic: string, callback: (data: unknown) => void): Promise<void> {
    const id = await pubsub.subscribe(topic, callback);
    subscriptionIds.push(id);
  }

  it('should deliver workspace updates to two concurrent subscribers on the same channel', async () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    await subscribe(TOPICS.WORKSPACE_UPSERTED(CHANNEL_ID), (data) => received1.push(data));
    await subscribe(TOPICS.WORKSPACE_UPSERTED(CHANNEL_ID), (data) => received2.push(data));

    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
      .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

    await ingestEvent({
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    } as HookEvent);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect((received1[0] as { workspaceUpserted: { id: string } }).workspaceUpserted.id).toBe(WORKSPACE_ID);
    expect((received2[0] as { workspaceUpserted: { id: string } }).workspaceUpserted.id).toBe(WORKSPACE_ID);
  });

  it('should deliver event creation notifications to two concurrent subscribers', async () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    await subscribe(TOPICS.SESSION_EVENT_CREATED(CHANNEL_ID), (data) => received1.push(data));
    await subscribe(TOPICS.SESSION_EVENT_CREATED(CHANNEL_ID), (data) => received2.push(data));

    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
      .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

    await ingestEvent({
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/src/test.ts', content: 'hello' },
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    } as HookEvent);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    const evt1 = (received1[0] as { sessionEventCreated: { workspaceId: string; event: { hookEventName: string } } }).sessionEventCreated;
    const evt2 = (received2[0] as { sessionEventCreated: { workspaceId: string; event: { hookEventName: string } } }).sessionEventCreated;
    expect(evt1.workspaceId).toBe(WORKSPACE_ID);
    expect(evt1.event.hookEventName).toBe('PostToolUse');
    expect(evt2.workspaceId).toBe(WORKSPACE_ID);
    expect(evt2.event.hookEventName).toBe('PostToolUse');
  });

  it('should NOT deliver updates to subscribers on a different channel', async () => {
    const OTHER_CHANNEL = 'chan-other-999';
    const otherReceived: unknown[] = [];
    const correctReceived: unknown[] = [];

    await subscribe(TOPICS.WORKSPACE_UPSERTED(OTHER_CHANNEL), (data) => otherReceived.push(data));
    await subscribe(TOPICS.WORKSPACE_UPSERTED(CHANNEL_ID), (data) => correctReceived.push(data));

    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
      .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

    await ingestEvent({
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    } as HookEvent);

    expect(correctReceived).toHaveLength(1);
    expect(otherReceived).toHaveLength(0);
  });

  it('should deliver multiple sequential events to all subscribers', async () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    await subscribe(TOPICS.SESSION_EVENT_CREATED(CHANNEL_ID), (data) => received1.push(data));
    await subscribe(TOPICS.SESSION_EVENT_CREATED(CHANNEL_ID), (data) => received2.push(data));

    // First event
    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
      .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

    await ingestEvent({
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    } as HookEvent);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    // Second event
    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
      .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

    await ingestEvent({
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/test.ts' },
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    } as HookEvent);

    expect(received1).toHaveLength(2);
    expect(received2).toHaveLength(2);

    const e1a = (received1[0] as { sessionEventCreated: { event: { hookEventName: string } } }).sessionEventCreated.event;
    const e1b = (received1[1] as { sessionEventCreated: { event: { hookEventName: string } } }).sessionEventCreated.event;
    expect(e1a.hookEventName).toBe('PreToolUse');
    expect(e1b.hookEventName).toBe('PostToolUse');
  });
});
