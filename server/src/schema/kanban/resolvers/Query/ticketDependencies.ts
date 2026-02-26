import type { QueryResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';

export const ticketDependencies: NonNullable<QueryResolvers['ticketDependencies']> = async (_parent, { messageId }, _ctx) => {
  const deps = await prisma.ticketDependency.findMany({
    where: { ticketMessageId: messageId },
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
    ticketMessageId: dep.ticketMessageId,
    dependsOnMessageId: dep.dependsOnMessageId,
    dependsOnTicketTitle: dep.dependsOn.ticket?.title ?? null,
    createdAt: dep.createdAt,
  }));
};
