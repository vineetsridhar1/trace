import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

const mockPrisma = vi.hoisted(() => ({
  electronInstance: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../lib/prisma', () => ({ default: mockPrisma }));

import {
  upsertInstance,
  getInstancesByUserId,
  setInstancePassword,
  verifyInstancePassword,
} from '../instanceService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('upsertInstance', () => {
  it('creates a new record when none exists', async () => {
    const input = { userId: 'u1', name: 'my-instance', serverId: 's1' };
    const created = { id: 'inst-1', ...input, passwordHash: null };
    mockPrisma.electronInstance.upsert.mockResolvedValue(created);

    const result = await upsertInstance(input);

    expect(mockPrisma.electronInstance.upsert).toHaveBeenCalledWith({
      where: { serverId: 's1' },
      create: { userId: 'u1', serverId: 's1', name: 'my-instance' },
      update: { name: 'my-instance', userId: 'u1' },
    });
    expect(result).toEqual(created);
  });

  it('updates the record when called again with same serverId but different name', async () => {
    const input = { userId: 'u1', name: 'new-name', serverId: 's1' };
    const updated = { id: 'inst-1', ...input, passwordHash: null };
    mockPrisma.electronInstance.upsert.mockResolvedValue(updated);

    const result = await upsertInstance(input);

    expect(mockPrisma.electronInstance.upsert).toHaveBeenCalledWith({
      where: { serverId: 's1' },
      create: { userId: 'u1', serverId: 's1', name: 'new-name' },
      update: { name: 'new-name', userId: 'u1' },
    });
    expect(result.name).toBe('new-name');
  });
});

describe('getInstancesByUserId', () => {
  it('returns all instances for a user and empty array for unknown user', async () => {
    const instances = [
      { id: 'i1', userId: 'u1', name: 'a', serverId: 's1' },
      { id: 'i2', userId: 'u1', name: 'b', serverId: 's2' },
    ];
    mockPrisma.electronInstance.findMany.mockResolvedValueOnce(instances);
    mockPrisma.electronInstance.findMany.mockResolvedValueOnce([]);

    const result = await getInstancesByUserId('u1');
    expect(result).toEqual(instances);
    expect(mockPrisma.electronInstance.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'asc' },
    });

    const empty = await getInstancesByUserId('unknown');
    expect(empty).toEqual([]);
  });
});

describe('setInstancePassword', () => {
  it('stores a hashed password, not the plaintext', async () => {
    let storedData: any;
    mockPrisma.electronInstance.update.mockImplementation(async (args: any) => {
      storedData = args.data;
      return { id: 'inst-1', ...args.data };
    });

    await setInstancePassword('inst-1', 'my-secret');

    expect(storedData.passwordHash).toBeDefined();
    expect(storedData.passwordHash).not.toBe('my-secret');
    // bcrypt hashes start with $2b$
    expect(storedData.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe('verifyInstancePassword', () => {
  it('returns true when instance has no password', async () => {
    mockPrisma.electronInstance.findUnique.mockResolvedValue({ passwordHash: null });
    expect(await verifyInstancePassword('inst-1', null)).toBe(true);
  });

  it('returns true when correct password provided', async () => {
    const password = 'correct-pw';
    const hash = await bcrypt.hash(password, 12);

    mockPrisma.electronInstance.findUnique.mockResolvedValue({ passwordHash: hash });
    expect(await verifyInstancePassword('inst-1', password)).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await bcrypt.hash('correct-pw', 12);

    mockPrisma.electronInstance.findUnique.mockResolvedValue({ passwordHash: hash });
    expect(await verifyInstancePassword('inst-1', 'wrong-pw')).toBe(false);
  });

  it('returns true after clearing the password with null', async () => {
    mockPrisma.electronInstance.update.mockImplementation(async (args: any) => {
      return { id: 'inst-1', ...args.data };
    });

    await setInstancePassword('inst-1', null);

    expect(mockPrisma.electronInstance.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { passwordHash: null },
    });

    mockPrisma.electronInstance.findUnique.mockResolvedValue({ passwordHash: null });
    expect(await verifyInstancePassword('inst-1', null)).toBe(true);
  });
});
