import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import type { WebSocket as WsType } from 'ws';

// --- Hoisted mocks ---
const mockVerifyJwt = vi.hoisted(() => vi.fn());
const mockUpsertInstance = vi.hoisted(() => vi.fn());
const mockInstanceRelay = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  handleResult: vi.fn(),
  recordPing: vi.fn(),
}));
const mockPubsub = vi.hoisted(() => ({
  publish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/authService', () => ({ verifyJwt: mockVerifyJwt }));
vi.mock('../../services/instanceService', () => ({ upsertInstance: mockUpsertInstance }));
vi.mock('../../services/instanceRelay', () => ({ instanceRelay: mockInstanceRelay }));
vi.mock('../../services/pubsub', () => ({
  pubsub: mockPubsub,
  TOPICS: {
    INSTANCE_STATUS_CHANGED: (serverId: string) => `INSTANCE_STATUS_CHANGED.${serverId}`,
  },
}));

import { handleInstanceSocket } from '../instanceSocket';

// --- Helpers ---

/** Minimal mock WebSocket that extends EventEmitter for on/off/emit. */
function createMockWs(): WsType & { sentMessages: unknown[] } {
  const emitter = new EventEmitter() as any;
  emitter.readyState = 1; // WebSocket.OPEN
  emitter.sentMessages = [] as unknown[];
  emitter.send = vi.fn((data: string) => {
    emitter.sentMessages.push(JSON.parse(data));
  });
  emitter.close = vi.fn(() => {
    emitter.emit('close');
  });
  emitter.terminate = vi.fn();
  return emitter;
}

function createReq(url: string): IncomingMessage {
  return { url } as IncomingMessage;
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockUpsertInstance.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handleInstanceSocket', () => {
  describe('JWT validation', () => {
    it('proceeds to registration phase with a valid token', async () => {
      mockVerifyJwt.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
      const ws = createMockWs();

      // Start handler — it will await the registration message
      const handlerDone = handleInstanceSocket(ws, createReq('/?token=valid-token'));

      // Send registration to unblock the promise
      ws.emit('message', JSON.stringify({ type: 'register', instanceId: 'i1', serverId: 's1', instanceName: 'dev' }));
      await handlerDone;

      // Socket was NOT closed — it's still alive
      expect(ws.close).not.toHaveBeenCalled();
      expect(mockVerifyJwt).toHaveBeenCalledWith('valid-token');
    });

    it('sends UNAUTHORIZED error and closes socket for invalid token', async () => {
      mockVerifyJwt.mockReturnValue(null);
      const ws = createMockWs();

      await handleInstanceSocket(ws, createReq('/?token=bad-token'));

      expect(ws.sentMessages).toContainEqual({ type: 'error', error: 'UNAUTHORIZED' });
      expect(ws.close).toHaveBeenCalled();
    });

    it('sends UNAUTHORIZED error and closes socket when token is missing', async () => {
      const ws = createMockWs();

      await handleInstanceSocket(ws, createReq('/'));

      expect(ws.sentMessages).toContainEqual({ type: 'error', error: 'UNAUTHORIZED' });
      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('registration', () => {
    it('registers instance and replies with { type: "registered", ok: true }', async () => {
      mockVerifyJwt.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
      const ws = createMockWs();

      const handlerDone = handleInstanceSocket(ws, createReq('/?token=t'));
      ws.emit('message', JSON.stringify({
        type: 'register',
        instanceId: 'i1',
        serverId: 's1',
        instanceName: 'dev',
      }));
      await handlerDone;

      // upsertInstance called with the right params
      expect(mockUpsertInstance).toHaveBeenCalledWith({
        userId: 'u1',
        serverId: 's1',
        name: 'dev',
      });

      // Instance registered in the relay
      expect(mockInstanceRelay.register).toHaveBeenCalledWith({
        instanceId: 'i1',
        userId: 'u1',
        serverId: 's1',
        socket: ws,
      });

      // Client receives registered confirmation
      expect(ws.sentMessages).toContainEqual({ type: 'registered', ok: true });

      // INSTANCE_STATUS_CHANGED published as online
      expect(mockPubsub.publish).toHaveBeenCalledWith(
        'INSTANCE_STATUS_CHANGED.s1',
        { instanceStatusChanged: { instanceId: 'i1', isOnline: true } },
      );
    });
  });

  describe('heartbeat ping/pong', () => {
    it('sends ping and records pong from client', async () => {
      mockVerifyJwt.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
      const ws = createMockWs();

      const handlerDone = handleInstanceSocket(ws, createReq('/?token=t'));
      ws.emit('message', JSON.stringify({
        type: 'register',
        instanceId: 'i1',
        serverId: 's1',
        instanceName: 'dev',
      }));
      await handlerDone;

      // Advance past one ping interval (30s)
      vi.advanceTimersByTime(30_000);

      expect(ws.sentMessages).toContainEqual({ type: 'ping' });

      // Client responds with pong
      ws.emit('message', JSON.stringify({ type: 'pong' }));

      expect(mockInstanceRelay.recordPing).toHaveBeenCalledWith('i1');
    });
  });

  describe('action-result forwarding', () => {
    it('forwards action-result to instanceRelay.handleResult', async () => {
      mockVerifyJwt.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
      const ws = createMockWs();

      const handlerDone = handleInstanceSocket(ws, createReq('/?token=t'));
      ws.emit('message', JSON.stringify({
        type: 'register',
        instanceId: 'i1',
        serverId: 's1',
        instanceName: 'dev',
      }));
      await handlerDone;

      const actionResult = {
        type: 'action-result',
        id: 'cmd-123',
        success: true,
        data: { output: 'hello' },
      };
      ws.emit('message', JSON.stringify(actionResult));

      expect(mockInstanceRelay.handleResult).toHaveBeenCalledWith(actionResult);
    });
  });

  describe('disconnect cleanup', () => {
    it('unregisters from relay and publishes isOnline: false on close', async () => {
      mockVerifyJwt.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
      const ws = createMockWs();

      const handlerDone = handleInstanceSocket(ws, createReq('/?token=t'));
      ws.emit('message', JSON.stringify({
        type: 'register',
        instanceId: 'i1',
        serverId: 's1',
        instanceName: 'dev',
      }));
      await handlerDone;

      // Reset to isolate disconnect-specific calls
      mockPubsub.publish.mockClear();

      // Simulate socket close
      ws.emit('close');

      expect(mockInstanceRelay.unregister).toHaveBeenCalledWith('i1');
      expect(mockPubsub.publish).toHaveBeenCalledWith(
        'INSTANCE_STATUS_CHANGED.s1',
        { instanceStatusChanged: { instanceId: 'i1', isOnline: false } },
      );
    });
  });
});
