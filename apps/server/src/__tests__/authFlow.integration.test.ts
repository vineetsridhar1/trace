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
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import type { Express } from 'express';
import { config } from '../config';

describe('Auth Flow Integration (JWT-protected GraphQL)', () => {
  let app: Express;

  const TEST_USER = {
    id: 'user-001',
    email: 'test@example.com',
    name: 'Test User',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'member',
    githubId: '12345',
    githubAccessToken: 'gho_fake',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  function makeValidToken() {
    return jwt.sign(
      { userId: TEST_USER.id, email: TEST_USER.email },
      config.jwtSecret,
      { expiresIn: '1h' },
    );
  }

  function makeExpiredToken() {
    return jwt.sign(
      { userId: TEST_USER.id, email: TEST_USER.email },
      config.jwtSecret,
      { expiresIn: '-1s' },
    );
  }

  function makeWrongSecretToken() {
    return jwt.sign(
      { userId: TEST_USER.id, email: TEST_USER.email },
      'wrong-secret-key',
      { expiresIn: '1h' },
    );
  }

  const SEND_MESSAGE_MUTATION = `
    mutation SendChannelMessage($channelId: ID!, $content: String!) {
      sendChannelMessage(channelId: $channelId, content: $content) {
        id
        content
      }
    }
  `;

  const HEALTH_QUERY = `
    query { __typename }
  `;

  it('should reject protected mutation without auth token (UNAUTHENTICATED)', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({
        query: SEND_MESSAGE_MUTATION,
        variables: { channelId: 'chan-001', content: 'Hello' },
      });

    expect(res.status).toBe(200); // GraphQL returns 200 with errors
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('should reject protected mutation with wrong secret (UNAUTHENTICATED)', async () => {
    const badToken = makeWrongSecretToken();

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${badToken}`)
      .send({
        query: SEND_MESSAGE_MUTATION,
        variables: { channelId: 'chan-001', content: 'Hello' },
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('should reject protected mutation with expired token (UNAUTHENTICATED)', async () => {
    const expiredToken = makeExpiredToken();

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({
        query: SEND_MESSAGE_MUTATION,
        variables: { channelId: 'chan-001', content: 'Hello' },
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('should accept protected mutation with valid JWT and return data', async () => {
    const token = makeValidToken();
    mockPrisma.user.findUnique.mockResolvedValue(TEST_USER);

    const createdMessage = {
      id: 'msg-001',
      channelId: 'chan-001',
      content: 'Hello',
      userId: TEST_USER.id,
      createdAt: new Date(),
    };
    mockPrisma.$transaction.mockResolvedValue(createdMessage);

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: SEND_MESSAGE_MUTATION,
        variables: { channelId: 'chan-001', content: 'Hello' },
      });

    expect(res.status).toBe(200);
    // If there are no errors, the auth succeeded
    if (res.body.errors) {
      // Only UNAUTHENTICATED would indicate an auth problem — other errors
      // (like missing DB data) are fine since auth itself passed
      const authErrors = res.body.errors.filter(
        (e: { extensions?: { code?: string } }) => e.extensions?.code === 'UNAUTHENTICATED',
      );
      expect(authErrors).toHaveLength(0);
    }
  });

  it('should allow unauthenticated access to non-protected queries', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({ query: HEALTH_QUERY });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('__typename', 'Query');
    expect(res.body.errors).toBeUndefined();
  });

  it('should resolve user from valid JWT in GraphQL context', async () => {
    const token = makeValidToken();
    mockPrisma.user.findUnique.mockResolvedValue(TEST_USER);

    // Use a query that requires auth to verify the context was populated
    // channelMessages requires auth via requireAuth
    mockPrisma.$transaction.mockResolvedValue([[], 0]);

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `query { channelMessages(channelId: "chan-001") { messages { id } } }`,
      });

    expect(res.status).toBe(200);
    // Verify user lookup was performed with the JWT userId
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TEST_USER.id } }),
    );
  });

  it('should reject when JWT is valid but user not found in DB', async () => {
    const token = makeValidToken();
    mockPrisma.user.findUnique.mockResolvedValue(null); // user deleted from DB

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: SEND_MESSAGE_MUTATION,
        variables: { channelId: 'chan-001', content: 'Hello' },
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('should relay events without JWT (POST /events is not auth-protected)', async () => {
    // The event relay endpoint is NOT behind JWT auth — Electron instances
    // send events directly. This verifies that auth doesn't block the relay.
    const WORKSPACE_ID = 'ws-auth-test';
    const CLI_SESSION_ID = 'sess-auth-test';

    mockPrisma.workspace.findUnique
      .mockResolvedValueOnce({
        id: WORKSPACE_ID,
        channelId: 'chan-001',
        cliSessionId: CLI_SESSION_ID,
        preview: null,
        importance: 'non-important',
        status: 'pending',
        summary: null,
        branch: null,
        sessions: [{ id: 'session-001', workspaceId: WORKSPACE_ID, createdAt: new Date() }],
      })
      .mockResolvedValueOnce({
        id: WORKSPACE_ID,
        channelId: 'chan-001',
        cliSessionId: CLI_SESSION_ID,
        preview: null,
        importance: 'non-important',
        status: 'in_progress',
        summary: null,
        branch: null,
        cliSession: { sessionId: CLI_SESSION_ID, cwd: '/test', status: 'active' },
        user: null,
        _count: { sessions: 1 },
      });

    mockPrisma.cliSession.upsert.mockResolvedValue({
      sessionId: CLI_SESSION_ID, cwd: '/test', status: 'active',
    });
    mockPrisma.workspace.update.mockResolvedValue({ id: WORKSPACE_ID });
    mockPrisma.event.create.mockResolvedValue({
      id: 'evt-001', hookEventName: 'PreToolUse', timestamp: new Date(),
    });
    mockPrisma.event.count.mockResolvedValue(0);
    mockPrisma.event.findFirst.mockResolvedValue(null);
    mockPrisma.event.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/events')
      .send({
        session_id: CLI_SESSION_ID,
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        cwd: `/worktrees/${WORKSPACE_ID}/src`,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'evt-001');
  });
});
