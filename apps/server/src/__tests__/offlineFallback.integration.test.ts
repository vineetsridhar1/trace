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

describe('Offline Fallback Integration (disconnect → offline → reconnect)', () => {
  const WORKSPACE_ID = 'ws-offline-001';
  const CLI_SESSION_ID = 'sess-offline-abc';
  const SESSION_ID = 'session-offline-001';
  const CHANNEL_ID = 'chan-offline-001';

  const subscriptionIds: number[] = [];

  function makeWorkspace(overrides: Record<string, unknown> = {}) {
    return {
      id: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      cliSessionId: CLI_SESSION_ID,
      preview: null,
      importance: 'non-important',
      status: 'in_progress',
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

  function makeEvent(hookEventName: string, extras: Record<string, unknown> = {}): HookEvent {
    return {
      session_id: CLI_SESSION_ID,
      hook_event_name: hookEventName,
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
      ...extras,
    } as HookEvent;
  }

  async function subscribe(topic: string, callback: (data: unknown) => void): Promise<void> {
    const id = await pubsub.subscribe(topic, callback);
    subscriptionIds.push(id);
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

  describe('disconnect detection (Stop event = offline)', () => {
    it('should mark CLI session as stopped when Stop event arrives', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      await ingestEvent(makeEvent('Stop', {
        stop_hook_active: false,
        last_assistant_message: 'Done',
      }));

      expect(mockPrisma.cliSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'stopped' }),
        }),
      );
    });

    it('should broadcast offline status (completed) via subscription', async () => {
      const received: unknown[] = [];
      await subscribe(TOPICS.WORKSPACE_UPSERTED(CHANNEL_ID), (data) => received.push(data));

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      await ingestEvent(makeEvent('Stop', {
        stop_hook_active: false,
        last_assistant_message: 'All done',
      }));

      expect(received.length).toBeGreaterThan(0);
      const last = received[received.length - 1] as { workspaceUpserted: { status: string } };
      expect(last.workspaceUpserted.status).toBe('completed');
    });

    it('should auto-complete workspace to completed on Stop without toolName', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete check
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      await ingestEvent(makeEvent('Stop', {
        stop_hook_active: false,
        last_assistant_message: 'Finished',
      }));

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'completed' },
      });
    });
  });

  describe('relay failure when offline (no active session)', () => {
    it('should still accept events and create them even after prior Stop', async () => {
      const latestPrompt = { timestamp: new Date('2025-01-01T12:00:00Z') };
      const latestStop = { timestamp: new Date('2025-01-01T11:00:00Z') };

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'completed' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      mockPrisma.event.findFirst
        .mockResolvedValueOnce(latestPrompt)
        .mockResolvedValueOnce(latestStop);

      const result = await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));
      expect(result).not.toBeNull();
      expect(result!.id).toBeDefined();
    });

    it('should NOT reactivate completed workspace when no new prompt since last Stop', async () => {
      const latestPrompt = { timestamp: new Date('2025-01-01T10:00:00Z') };
      const latestStop = { timestamp: new Date('2025-01-01T11:00:00Z') }; // newer

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'completed' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      mockPrisma.event.findFirst.mockImplementation(async (args: { where: { hookEventName?: string } }) => {
        if (args.where.hookEventName === 'UserPromptSubmit') return latestPrompt;
        if (args.where.hookEventName === 'Stop') return latestStop;
        return null;
      });

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      const reactivateCalls = mockPrisma.workspace.update.mock.calls.filter(
        (c: unknown[]) => (c[0] as { data: { status?: string } }).data.status === 'in_progress',
      );
      expect(reactivateCalls).toHaveLength(0);
    });
  });

  describe('reconnect (new events resume live mode)', () => {
    it('should mark CLI session active again when new event arrives after Stop', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(mockPrisma.cliSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'active' }),
        }),
      );
    });

    it('should broadcast online status (in_progress) when resuming after completion', async () => {
      const received: unknown[] = [];
      await subscribe(TOPICS.WORKSPACE_UPSERTED(CHANNEL_ID), (data) => received.push(data));

      const latestPrompt = { timestamp: new Date('2025-01-01T12:00:00Z') };
      const latestStop = { timestamp: new Date('2025-01-01T11:00:00Z') };

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'completed' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      mockPrisma.event.findFirst
        .mockResolvedValueOnce(latestPrompt)
        .mockResolvedValueOnce(latestStop);

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(received.length).toBeGreaterThan(0);
      const last = received[received.length - 1] as { workspaceUpserted: { status: string } };
      expect(last.workspaceUpserted.status).toBe('in_progress');
    });

    it('should complete full lifecycle: online → offline → online', async () => {
      const statusUpdates: string[] = [];
      await subscribe(TOPICS.WORKSPACE_UPSERTED(CHANNEL_ID), (data) => {
        const ws = (data as { workspaceUpserted: { status: string } }).workspaceUpserted;
        statusUpdates.push(ws.status);
      });

      // Phase 1: Online — PreToolUse event (pending → in_progress)
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(statusUpdates[statusUpdates.length - 1]).toBe('in_progress');
      expect(mockPrisma.cliSession.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'active' }),
        }),
      );

      // Phase 2: Offline — Stop event (in_progress → completed)
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      await ingestEvent(makeEvent('Stop', {
        stop_hook_active: false,
        last_assistant_message: 'Stopped',
      }));

      expect(statusUpdates[statusUpdates.length - 1]).toBe('completed');
      expect(mockPrisma.cliSession.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'stopped' }),
        }),
      );

      // Phase 3: Reconnect — new prompt + event (completed → in_progress)
      const latestPrompt = { timestamp: new Date('2025-06-01T12:00:00Z') };
      const latestStop = { timestamp: new Date('2025-06-01T11:00:00Z') };

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'completed' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      mockPrisma.event.findFirst
        .mockResolvedValueOnce(latestPrompt)
        .mockResolvedValueOnce(latestStop);

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(statusUpdates[statusUpdates.length - 1]).toBe('in_progress');
      expect(mockPrisma.cliSession.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'active' }),
        }),
      );
    });
  });
});
