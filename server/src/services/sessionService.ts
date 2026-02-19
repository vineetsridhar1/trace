import prisma from '../lib/prisma';

export async function listSessions(options: {
  status?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
} = {}) {
  const { status, limit = 50, offset = 0, sort = 'lastSeenAt', order = 'desc' } = options;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: { [sort]: order },
      skip: offset,
      take: limit,
      include: {
        _count: { select: { events: true } },
      },
    }),
    prisma.session.count({ where }),
  ]);

  const result = sessions.map((s) => {
    const { _count, ...rest } = s;
    return { ...rest, eventCount: _count.events };
  });

  return { sessions: result, total, limit, offset };
}

export async function getSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { sessionId },
    include: {
      _count: { select: { events: true } },
    },
  });

  if (!session) return null;

  // Get tool summary
  const toolCounts = await prisma.event.groupBy({
    by: ['toolName'],
    where: { sessionId, toolName: { not: null } },
    _count: true,
  });

  const toolSummary: Record<string, number> = {};
  for (const tc of toolCounts) {
    if (tc.toolName) {
      toolSummary[tc.toolName] = (tc as unknown as { _count: number })._count;
    }
  }

  const { _count, ...rest } = session;
  return {
    ...rest,
    eventCount: _count.events,
    toolSummary,
  };
}
