import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  createTicketForWorkspace: vi.fn(),
  linkTicketToWorkspace: vi.fn(),
}));

import { ingestEvent } from '../services/eventService';
import type { HookEvent } from '../types/hookEvents';

describe('Instance Lifecycle (workspace status transitions via events)', () => {
  const WORKSPACE_ID = 'ws-lifecycle-001';
  const CLI_SESSION_ID = 'sess-lifecycle-abc';
  const SESSION_ID = 'session-001';
  const CHANNEL_ID = 'chan-lifecycle-001';

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

  const cliSession = {
    sessionId: CLI_SESSION_ID,
    transcriptPath: null,
    cwd: '/test',
    status: 'active',
  };

  function makeEvent(hookEventName: string, extras: Record<string, unknown> = {}): HookEvent {
    return {
      session_id: CLI_SESSION_ID,
      hook_event_name: hookEventName,
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
      ...extras,
    } as HookEvent;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.cliSession.upsert.mockResolvedValue(cliSession);
    mockPrisma.workspace.update.mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
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
    mockPrisma.session.create.mockResolvedValue({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      createdAt: new Date(),
    });
  });

  describe('pending → in_progress', () => {
    it('should transition on first PreToolUse event', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      const result = await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(result).not.toBeNull();
      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'in_progress' },
      });
    });

    it('should transition on first PostToolUse event', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      const result = await ingestEvent(
        makeEvent('PostToolUse', { tool_name: 'Write', tool_input: { file_path: '/test.ts' } }),
      );

      expect(result).not.toBeNull();
      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'in_progress' },
      });
    });

    it('should NOT transition on UserPromptSubmit', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'pending' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'pending' }));

      await ingestEvent(makeEvent('UserPromptSubmit', { prompt: 'Hello' }));

      const statusCalls = mockPrisma.workspace.update.mock.calls.filter(
        (c: unknown[]) => (c[0] as { data: { status?: string } }).data.status === 'in_progress',
      );
      expect(statusCalls).toHaveLength(0);
    });
  });

  describe('in_progress → needs_input', () => {
    it('should transition when AskUserQuestion tool is detected', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'needs_input' }));

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: true,
          last_assistant_message: 'What should I do?',
          extracted_tool_name: 'AskUserQuestion',
          extracted_tool_input: { question: 'What should I do?' },
        }),
      );

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'needs_input' },
      });
    });

    it('should transition when ExitPlanMode tool is detected', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'needs_input' }));

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: true,
          extracted_tool_name: 'ExitPlanMode',
        }),
      );

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'needs_input' },
      });
    });
  });

  describe('needs_input → in_progress', () => {
    it('should transition when UserPromptSubmit arrives', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'needs_input' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      await ingestEvent(makeEvent('UserPromptSubmit', { prompt: 'Yes, continue' }));

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'in_progress' },
      });
    });

    it('should transition when any non-Stop event arrives (user already responded)', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'needs_input' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'in_progress' },
      });
    });

    it('should NOT transition on Stop event', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'needs_input' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'needs_input' })) // auto-complete check
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'needs_input' }));

      await ingestEvent(
        makeEvent('Stop', { stop_hook_active: false, last_assistant_message: 'Stopped' }),
      );

      const statusCalls = mockPrisma.workspace.update.mock.calls.filter(
        (c: unknown[]) => (c[0] as { data: { status?: string } }).data.status === 'in_progress',
      );
      expect(statusCalls).toHaveLength(0);
    });
  });

  describe('in_progress/needs_input → completed (auto-complete)', () => {
    it('should auto-complete on Stop without toolName when in_progress', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // re-read for auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' })); // broadcast

      mockPrisma.event.findMany.mockResolvedValue([]); // no write events in current turn

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: false,
          last_assistant_message: 'All done!',
        }),
      );

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'completed' },
      });
    });

    it('should auto-complete on Stop without toolName when needs_input', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'needs_input' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'needs_input' })) // re-read for auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      mockPrisma.event.findMany.mockResolvedValue([]);

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: false,
          last_assistant_message: 'Done waiting',
        }),
      );

      // Stop on needs_input should NOT transition to in_progress first, but auto-complete should fire
      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: { status: 'completed' },
      });
    });

    it('should NOT auto-complete when Stop has a toolName (waiting for input)', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'needs_input' }));

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: true,
          last_assistant_message: 'What?',
          extracted_tool_name: 'AskUserQuestion',
          extracted_tool_input: { question: 'What?' },
        }),
      );

      const completedCalls = mockPrisma.workspace.update.mock.calls.filter(
        (c: unknown[]) => (c[0] as { data: { status?: string } }).data.status === 'completed',
      );
      expect(completedCalls).toHaveLength(0);
    });
  });

  describe('completed → in_progress (re-activation)', () => {
    it('should re-activate when new prompt was submitted after last Stop', async () => {
      const latestPrompt = { timestamp: new Date('2025-01-01T12:00:00Z') };
      const latestStop = { timestamp: new Date('2025-01-01T11:00:00Z') }; // older

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'completed' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'in_progress' }));

      // Promise.all fires two findFirst calls concurrently:
      // 1) UserPromptSubmit query → latestPrompt
      // 2) Stop query → latestStop
      mockPrisma.event.findFirst
        .mockResolvedValueOnce(latestPrompt)
        .mockResolvedValueOnce(latestStop);

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WORKSPACE_ID },
          data: { status: 'in_progress' },
        }),
      );
    });

    it('should NOT re-activate when no new prompt since last Stop', async () => {
      const latestPrompt = { timestamp: new Date('2025-01-01T10:00:00Z') };
      const latestStop = { timestamp: new Date('2025-01-01T11:00:00Z') }; // newer

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'completed' }))
        .mockResolvedValueOnce(makeFeedWorkspace({ status: 'completed' }));

      // Use mockImplementation to respond based on the query args instead of relying on call order
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

  describe('CLI session lifecycle', () => {
    it('should upsert CLI session as active on non-Stop events', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace())
        .mockResolvedValueOnce(makeFeedWorkspace());

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(mockPrisma.cliSession.upsert).toHaveBeenCalledWith({
        where: { sessionId: CLI_SESSION_ID },
        create: expect.objectContaining({ status: 'active' }),
        update: expect.objectContaining({ status: 'active' }),
      });
    });

    it('should mark CLI session as stopped on Stop event', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace());

      await ingestEvent(
        makeEvent('Stop', { stop_hook_active: false, last_assistant_message: 'Done' }),
      );

      expect(mockPrisma.cliSession.upsert).toHaveBeenCalledWith({
        where: { sessionId: CLI_SESSION_ID },
        create: expect.objectContaining({ status: 'active' }),
        update: expect.objectContaining({ status: 'stopped' }),
      });
    });
  });

  describe('Stop event deduplication', () => {
    it('should merge into existing Stop when one was recently created', async () => {
      const recentStop = {
        id: 'evt-recent-stop',
        sessionId: SESSION_ID,
        cliSessionId: CLI_SESSION_ID,
        hookEventName: 'Stop',
        toolName: null,
        toolInput: null,
        lastAssistantMessage: null,
        rawPayload: { hook_event_name: 'Stop' },
        timestamp: new Date(),
      };

      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace());

      // findFirst calls: 1) dedup turn window (latestPrompt), 2) dedup (recentStop)
      mockPrisma.event.findFirst
        .mockResolvedValueOnce(null) // no latest prompt for dedupe window
        .mockResolvedValueOnce(recentStop) // recent stop found
        .mockResolvedValueOnce(null); // auto-complete: no latest prompt

      mockPrisma.event.update.mockResolvedValue({ ...recentStop, lastAssistantMessage: 'Enriched message' });

      const result = await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: false,
          last_assistant_message: 'Enriched message',
        }),
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('evt-recent-stop');
      // Should update existing event, not create new
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-recent-stop' },
        }),
      );
      expect(mockPrisma.event.create).not.toHaveBeenCalled();
    });
  });

  describe('session creation', () => {
    it('should create a session when workspace has no sessions', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ sessions: [] })) // no sessions
        .mockResolvedValueOnce(makeFeedWorkspace());

      await ingestEvent(makeEvent('PreToolUse', { tool_name: 'Read' }));

      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: { workspaceId: WORKSPACE_ID },
      });
    });
  });

  describe('preview and importance', () => {
    it('should set preview from first UserPromptSubmit', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'pending', preview: null }))
        .mockResolvedValueOnce(makeFeedWorkspace());

      await ingestEvent(makeEvent('UserPromptSubmit', { prompt: 'Fix the auth bug' }));

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: expect.objectContaining({
          preview: 'Fix the auth bug',
          importance: 'important',
        }),
      });
    });

    it('should NOT overwrite existing preview', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress', preview: 'Existing preview' }))
        .mockResolvedValueOnce(makeFeedWorkspace());

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: false,
          last_assistant_message: 'New message that should not replace preview',
        }),
      );

      // preview should not be updated since one already exists
      const previewCalls = mockPrisma.workspace.update.mock.calls.filter(
        (c: unknown[]) => (c[0] as { data: { preview?: string } }).data.preview !== undefined,
      );
      expect(previewCalls).toHaveLength(0);
    });

    it('should set summary and branch from Stop event', async () => {
      mockPrisma.workspace.findUnique
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress', preview: 'existing' }))
        .mockResolvedValueOnce(makeWorkspace({ status: 'in_progress' })) // auto-complete
        .mockResolvedValueOnce(makeFeedWorkspace());

      await ingestEvent(
        makeEvent('Stop', {
          stop_hook_active: false,
          last_assistant_message: 'Implemented the feature successfully',
          branch_name: 'feature/auth-fix',
        }),
      );

      expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID },
        data: expect.objectContaining({
          summary: 'Implemented the feature successfully',
          branch: 'feature/auth-fix',
        }),
      });
    });
  });

  describe('workspace not found', () => {
    it('should return null when workspace cannot be resolved', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);

      const result = await ingestEvent(
        makeEvent('PreToolUse', { tool_name: 'Read', cwd: '/no/worktrees/here' }),
      );

      expect(result).toBeNull();
    });
  });
});
