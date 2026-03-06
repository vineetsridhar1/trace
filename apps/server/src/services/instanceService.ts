import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

const BCRYPT_COST = 12;

export async function getInstancesByUserId(userId: string) {
  return prisma.electronInstance.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getInstanceById(id: string) {
  return prisma.electronInstance.findUnique({ where: { id } });
}

export async function upsertInstance(data: { userId: string; serverId: string; name: string }) {
  return prisma.electronInstance.upsert({
    where: { serverId: data.serverId },
    create: {
      userId: data.userId,
      serverId: data.serverId,
      name: data.name,
    },
    update: {
      name: data.name,
      userId: data.userId,
    },
  });
}

export async function setInstancePassword(instanceId: string, password: string | null) {
  const passwordHash = password ? await bcrypt.hash(password, BCRYPT_COST) : null;
  await prisma.electronInstance.update({
    where: { id: instanceId },
    data: { passwordHash },
  });
}

export async function verifyInstancePassword(instanceId: string, password: string | null): Promise<boolean> {
  const instance = await prisma.electronInstance.findUnique({
    where: { id: instanceId },
    select: { passwordHash: true },
  });
  if (!instance) return false;
  if (!instance.passwordHash) return true;
  if (!password) return false;
  return bcrypt.compare(password, instance.passwordHash);
}
