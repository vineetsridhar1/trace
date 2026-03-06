import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphQLError } from 'graphql';
import { relayAction } from '../resolvers/Mutation/relayAction';

vi.mock('../../../services/instanceService', () => ({
  getInstanceById: vi.fn(),
}));

vi.mock('../../../services/instanceRelay', () => ({
  instanceRelay: {
    isOnline: vi.fn(),
    sendCommand: vi.fn(),
  },
}));

vi.mock('../resolvers/Mutation/connectToInstance', () => ({
  authorizedSessions: new Set<string>(),
}));

import { getInstanceById } from '../../../services/instanceService';
import { instanceRelay } from '../../../services/instanceRelay';
import { authorizedSessions } from '../resolvers/Mutation/connectToInstance';

const mockedGetInstanceById = vi.mocked(getInstanceById);
const mockedRelay = vi.mocked(instanceRelay);

const OWNER = { id: 'user-1', email: 'owner@test.com', name: 'Owner' };
const COLLABORATOR = { id: 'user-2', email: 'collab@test.com', name: 'Collaborator' };
const STRANGER = { id: 'user-3', email: 'stranger@test.com', name: 'Stranger' };

const INSTANCE = {
  id: 'inst-1',
  userId: OWNER.id,
  serverId: 'srv-1',
  name: 'Test Instance',
  createdAt: new Date(),
  updatedAt: new Date(),
  passwordHash: null,
};

const baseArgs = { instanceId: 'inst-1', action: 'spawnAgent', params: { cmd: 'ls' } };

beforeEach(() => {
  vi.resetAllMocks();
  authorizedSessions.clear();
  mockedGetInstanceById.mockResolvedValue(INSTANCE);
  mockedRelay.isOnline.mockReturnValue(true);
});

describe('relayAction', () => {
  it('throws UNAUTHENTICATED when ctx.user is null', async () => {
    await expect(relayAction({}, baseArgs, { user: null } as any, {} as any)).rejects.toThrow(GraphQLError);
    await expect(relayAction({}, baseArgs, { user: null } as any, {} as any)).rejects.toThrow(
      expect.objectContaining({
        extensions: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      }),
    );
  });

  it('returns UNAUTHORIZED when user is not owner and not authorized', async () => {
    const result = await relayAction({}, baseArgs, { user: STRANGER } as any, {} as any);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns INSTANCE_OFFLINE when instance is not online', async () => {
    mockedRelay.isOnline.mockReturnValue(false);

    const result = await relayAction({}, baseArgs, { user: OWNER } as any, {} as any);
    expect(result).toEqual({ success: false, error: 'INSTANCE_OFFLINE' });
  });

  it('succeeds for the instance owner', async () => {
    mockedRelay.sendCommand.mockResolvedValue({
      id: 'cmd-1',
      type: 'action-result',
      success: true,
      data: { output: 'hello' },
    });

    const result = await relayAction({}, baseArgs, { user: OWNER } as any, {} as any);

    expect(result).toEqual({ success: true, data: { output: 'hello' }, error: undefined });
    expect(mockedRelay.sendCommand).toHaveBeenCalledWith('inst-1', 'spawnAgent', { cmd: 'ls' });
  });

  it('succeeds for an authorized collaborator', async () => {
    authorizedSessions.add(`${COLLABORATOR.id}:${INSTANCE.id}`);
    mockedRelay.sendCommand.mockResolvedValue({
      id: 'cmd-2',
      type: 'action-result',
      success: true,
      data: { output: 'ok' },
    });

    const result = await relayAction({}, baseArgs, { user: COLLABORATOR } as any, {} as any);

    expect(result).toEqual({ success: true, data: { output: 'ok' }, error: undefined });
  });

  it('returns RELAY_TIMEOUT when sendCommand rejects with timeout', async () => {
    mockedRelay.sendCommand.mockRejectedValue(new Error('RELAY_TIMEOUT'));

    const result = await relayAction({}, baseArgs, { user: OWNER } as any, {} as any);

    expect(result).toEqual({ success: false, error: 'RELAY_TIMEOUT' });
  });
});
