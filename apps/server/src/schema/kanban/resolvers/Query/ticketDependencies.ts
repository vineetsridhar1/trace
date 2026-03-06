import type { QueryResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';

export const ticketDependencies: NonNullable<QueryResolvers['ticketDependencies']> = async (_parent, { workspaceId }, _ctx) => {
  const deps = await prisma.ticketDependency.findMany({
    where: { ticketWorkspaceId: workspaceId },
    include: {
      dependsOn: {
        include: {
          ticket: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return deps.map((dep) => ({
    id: dep.id,
    ticketWorkspaceId: dep.ticketWorkspaceId,
    dependsOnWorkspaceId: dep.dependsOnWorkspaceId,
    dependsOnTicketTitle: dep.dependsOn.ticket?.title ?? null,
    createdAt: dep.createdAt,
  }));
};
