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

// Mock ticket service to prevent fire-and-forget side effects
vi.mock('../services/ticketService', () => ({
  updateTicketFromEvent: vi.fn(),
  syncTicketWithWorkspaceStatus: vi.fn(),
  refreshTicketBroadcast: vi.fn(),
  checkAndTriggerDependents: vi.fn(),
  triggerReviewIfAutonomous: vi.fn(),
}));

import request from 'supertest';
import { createApp } from '../app';
import type { Express } from 'express';

describe('Event Relay Integration (POST /events)', () => {
  let app: Express;

  const WORKSPACE_ID = 'ws-001';
  const CLI_SESSION_ID = 'session-abc-123';
  const SESSION_ID = 'sess-001';
  const CHANNEL_ID = 'chan-001';

  const baseWorkspace = {
    id: WORKSPACE_ID,
    channelId: CHANNEL_ID,
    cliSessionId: CLI_SESSION_ID,
    preview: null,
    importance: 'non-important',
    status: 'pending',
    summary: null,
    branch: null,
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID, createdAt: new Date() }],
  };

  const baseFeedWorkspace = {
    ...baseWorkspace,
    cliSession: { sessionId: CLI_SESSION_ID, cwd: '/test', status: 'active' },
    user: null,
    _count: { sessions: 1 },
  };

  const cliSession = {
    sessionId: CLI_SESSION_ID,
    transcriptPath: null,
    cwd: '/test',
    status: 'active',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();

    // Default: workspace found via worktree path
    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce({ ...baseWorkspace, sessions: baseWorkspace.sessions }) // getWorkspaceByIdWithSessions
      .mockResolvedValueOnce(baseFeedWorkspace); // getWorkspaceByIdForFeed (broadcast)

    mockPrisma.cliSession.upsert.mockResolvedValue(cliSession);
    mockPrisma.workspace.update.mockResolvedValue(baseWorkspace);
    mockPrisma.event.create.mockResolvedValue({
      id: 'evt-001',
      cliSessionId: CLI_SESSION_ID,
      hookEventName: 'PreToolUse',
      sessionId: SESSION_ID,
      rawPayload: {},
      timestamp: new Date(),
    });
    mockPrisma.event.count.mockResolvedValue(0);
    mockPrisma.event.findFirst.mockResolvedValue(null);
    mockPrisma.event.findMany.mockResolvedValue([]);
  });

  it('should accept a valid PreToolUse event and return 201', async () => {
    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/src/index.ts' },
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'evt-001');
    expect(res.body).toHaveProperty('session_id', CLI_SESSION_ID);
    expect(mockPrisma.cliSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: CLI_SESSION_ID },
        create: expect.objectContaining({ sessionId: CLI_SESSION_ID, status: 'active' }),
      }),
    );
  });

  it('should accept a valid PostToolUse event', async () => {
    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/src/test.ts', content: 'hello' },
      tool_response: { success: true },
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(201);
    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hookEventName: 'PostToolUse',
        toolName: 'Write',
      }),
    });
  });

  it('should accept a valid UserPromptSubmit event', async () => {
    mockPrisma.event.findFirst.mockResolvedValue(null); // no duplicate

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Fix the bug in main.ts',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(201);
    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hookEventName: 'UserPromptSubmit',
        importance: 'important',
      }),
    });
  });

  it('should accept a valid Stop event', async () => {
    // For Stop: workspace lookup + status check + auto-complete
    mockPrisma.workspace.findUnique
      .mockReset()
      .mockResolvedValueOnce({ ...baseWorkspace, status: 'in_progress', sessions: baseWorkspace.sessions })
      .mockResolvedValueOnce({ ...baseWorkspace, status: 'in_progress' }) // auto-complete check
      .mockResolvedValueOnce(baseFeedWorkspace); // broadcast

    mockPrisma.event.findFirst.mockResolvedValue(null); // no recent Stop to dedupe

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'Done fixing the bug',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(201);
    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hookEventName: 'Stop',
        importance: 'important',
      }),
    });
  });

  it('should return 204 when workspace cannot be resolved from cwd', async () => {
    mockPrisma.workspace.findUnique.mockReset().mockResolvedValue(null);

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: '/some/random/path', // no worktree marker
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(204);
  });

  it('should return 400 for invalid event payload', async () => {
    const payload = {
      // missing session_id and hook_event_name
      tool_name: 'Read',
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('should return 400 for unknown hook_event_name', async () => {
    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'InvalidEvent',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('should transition pending workspace to in_progress on non-prompt event', async () => {
    mockPrisma.workspace.findUnique
      .mockReset()
      .mockResolvedValueOnce({ ...baseWorkspace, status: 'pending', sessions: baseWorkspace.sessions })
      .mockResolvedValueOnce(baseFeedWorkspace);

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    await request(app).post('/events').send(payload);

    // Should have called updateWorkspaceStatus with 'in_progress'
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WORKSPACE_ID },
        data: { status: 'in_progress' },
      }),
    );
  });

  it('should NOT transition pending workspace on UserPromptSubmit', async () => {
    mockPrisma.workspace.findUnique
      .mockReset()
      .mockResolvedValueOnce({ ...baseWorkspace, status: 'pending', sessions: baseWorkspace.sessions })
      .mockResolvedValueOnce(baseFeedWorkspace);

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Hello',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    await request(app).post('/events').send(payload);

    // Should NOT have updated status
    const statusUpdateCalls = mockPrisma.workspace.update.mock.calls.filter(
      (call: unknown[]) => (call[0] as { data: { status?: string } }).data.status === 'in_progress',
    );
    expect(statusUpdateCalls).toHaveLength(0);
  });

  it('should deduplicate UserPromptSubmit when identical prompt exists', async () => {
    const existingEvent = {
      id: 'evt-existing',
      sessionId: SESSION_ID,
      hookEventName: 'UserPromptSubmit',
      rawPayload: { prompt: 'Fix the bug' },
      timestamp: new Date(),
    };

    mockPrisma.event.findFirst.mockResolvedValueOnce(existingEvent);

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Fix the bug',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('evt-existing');
    // Should NOT have created a new event
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it('should update agentSessionId on workspace for real session IDs', async () => {
    const payload = {
      session_id: 'real-agent-session-id',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    mockPrisma.cliSession.upsert.mockResolvedValue({ ...cliSession, sessionId: 'real-agent-session-id' });

    await request(app).post('/events').send(payload);

    expect(mockPrisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WORKSPACE_ID },
        data: expect.objectContaining({
          agentSessionId: 'real-agent-session-id',
          cliSessionId: 'real-agent-session-id',
        }),
      }),
    );
  });

  it('should NOT save agentSessionId for trace-local-* sessions', async () => {
    const payload = {
      session_id: 'trace-local-fake-123',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    mockPrisma.cliSession.upsert.mockResolvedValue({ ...cliSession, sessionId: 'trace-local-fake-123' });

    await request(app).post('/events').send(payload);

    // Should update cliSessionId but NOT agentSessionId
    const updateCall = mockPrisma.workspace.update.mock.calls.find(
      (call: unknown[]) => (call[0] as { data: { cliSessionId?: string } }).data.cliSessionId === 'trace-local-fake-123',
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![0] as { data: Record<string, unknown> }).data.agentSessionId).toBeUndefined();
  });

  it('should resolve workspace from transcript_path when cwd has no worktree', async () => {
    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: '/some/normal/path',
      transcript_path: `/worktrees/${WORKSPACE_ID}/transcript.jsonl`,
    };

    await request(app).post('/events').send(payload);

    expect(mockPrisma.workspace.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WORKSPACE_ID },
      }),
    );
  });

  it('should handle Stop with enrichment data (usage, branch)', async () => {
    mockPrisma.workspace.findUnique
      .mockReset()
      .mockResolvedValueOnce({ ...baseWorkspace, status: 'in_progress', sessions: baseWorkspace.sessions })
      .mockResolvedValueOnce({ ...baseWorkspace, status: 'in_progress' }) // auto-complete check
      .mockResolvedValueOnce(baseFeedWorkspace); // broadcast

    mockPrisma.event.findFirst.mockResolvedValue(null);

    const payload = {
      session_id: CLI_SESSION_ID,
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'All done',
      extracted_usage: { input_tokens: 1000, output_tokens: 500 },
      branch_name: 'feature/my-branch',
      cwd: `/worktrees/${WORKSPACE_ID}/src`,
    };

    const res = await request(app).post('/events').send(payload);

    expect(res.status).toBe(201);
    // Should update summary and branch
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WORKSPACE_ID },
        data: expect.objectContaining({
          branch: 'feature/my-branch',
        }),
      }),
    );
  });
});
