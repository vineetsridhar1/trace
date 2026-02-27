import prisma from '../lib/prisma';

export async function listCliSessions(options: {
  status?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
} = {}) {
  const { status, limit = 50, offset = 0, sort = 'lastSeenAt', order = 'desc' } = options;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [cliSessions, total] = await Promise.all([
    prisma.cliSession.findMany({
      where,
      orderBy: { [sort]: order },
      skip: offset,
      take: limit,
      include: {
        _count: { select: { events: true } },
      },
    }),
    prisma.cliSession.count({ where }),
  ]);

  const result = cliSessions.map((s) => {
    const { _count, ...rest } = s;
    return { ...rest, eventCount: _count.events };
  });

  return { sessions: result, total, limit, offset };
}

export async function getCliSession(sessionId: string) {
  const cliSession = await prisma.cliSession.findUnique({
    where: { sessionId },
    include: {
      _count: { select: { events: true } },
    },
  });

  if (!cliSession) return null;

  // Get tool summary
  const toolCounts = await prisma.event.groupBy({
    by: ['toolName'],
    where: { cliSessionId: sessionId, toolName: { not: null } },
    _count: true,
  });

  const toolSummary: Record<string, number> = {};
  for (const tc of toolCounts) {
    if (tc.toolName) {
      toolSummary[tc.toolName] = (tc as unknown as { _count: number })._count;
    }
  }

  const { _count, ...rest } = cliSession;
  return {
    ...rest,
    eventCount: _count.events,
    toolSummary,
  };
}
