import type { ElectronInstanceResolvers } from './../../types.generated';
import { instanceRelay } from '../../../services/instanceRelay';
import prisma from '../../../lib/prisma';

export const ElectronInstance: ElectronInstanceResolvers = {
  isOnline: (parent) => {
    return instanceRelay.isOnline(parent.id);
  },
  hasPassword: (parent) => {
    return parent.passwordHash != null;
  },
  owner: async (parent) => {
    const user = await prisma.user.findUnique({
      where: { id: parent.userId },
      select: { id: true, name: true, avatarUrl: true },
    });
    return user!;
  },
};
