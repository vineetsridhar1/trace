import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { instanceRelay } from '../instanceRelay';
import type { RelayResult } from '../instanceRelay';

function createMockSocket() {
  return { send: vi.fn() } as any;
}

function registerInstance(instanceId: string, serverId: string, socket = createMockSocket()) {
  instanceRelay.register({ instanceId, userId: 'user-1', serverId, socket });
  return socket;
}

describe('instanceRelay', () => {
  beforeEach(() => {
    instanceRelay._reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('register — isOnline returns true after registering', () => {
    registerInstance('inst-1', 'server-1');
    expect(instanceRelay.isOnline('inst-1')).toBe(true);
  });

  it('unregister — isOnline returns false after unregistering', () => {
    registerInstance('inst-1', 'server-1');
    instanceRelay.unregister('inst-1');
    expect(instanceRelay.isOnline('inst-1')).toBe(false);
  });

  it('sendCommand — success path resolves with result', async () => {
    const socket = registerInstance('inst-1', 'server-1');

    const promise = instanceRelay.sendCommand('inst-1', 'spawnAgent', { foo: 'bar' });

    expect(socket.send).toHaveBeenCalledOnce();
    const sentMessage = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sentMessage.action).toBe('spawnAgent');

    const result: RelayResult = {
      id: sentMessage.id,
      type: 'action-result',
      success: true,
      data: { status: 'ok' },
    };
    instanceRelay.handleResult(result);

    const resolved = await promise;
    expect(resolved).toEqual(result);
  });

  it('sendCommand — offline instance rejects with INSTANCE_OFFLINE', async () => {
    await expect(
      instanceRelay.sendCommand('nonexistent', 'spawnAgent', {}),
    ).rejects.toThrow('is not online');
  });

  it('sendCommand — timeout rejects with RELAY_TIMEOUT after 15 seconds', async () => {
    registerInstance('inst-1', 'server-1');

    const promise = instanceRelay.sendCommand('inst-1', 'spawnAgent', {});

    vi.advanceTimersByTime(15_000);

    await expect(promise).rejects.toThrow('RELAY_TIMEOUT');
  });

  it('getOnlineInstanceIds — returns correct instance IDs for a serverId', () => {
    registerInstance('inst-1', 'server-A');
    registerInstance('inst-2', 'server-A');
    registerInstance('inst-3', 'server-B');

    const idsA = instanceRelay.getOnlineInstanceIds('server-A');
    expect(idsA).toHaveLength(2);
    expect(idsA).toContain('inst-1');
    expect(idsA).toContain('inst-2');

    expect(instanceRelay.getOnlineInstanceIds('server-B')).toEqual(['inst-3']);
    expect(instanceRelay.getOnlineInstanceIds('server-C')).toEqual([]);
  });

  it('recordPing — updates lastPingAt timestamp', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    registerInstance('inst-1', 'server-1');

    const initialPing = instanceRelay.getLastPingAt('inst-1');

    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    instanceRelay.recordPing('inst-1');

    const updatedPing = instanceRelay.getLastPingAt('inst-1');
    expect(updatedPing!.getTime()).toBeGreaterThan(initialPing!.getTime());
  });
});
