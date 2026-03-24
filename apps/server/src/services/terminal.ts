import { prisma } from "../lib/db.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { isFullyUnloadedSession } from "./session.js";

class TerminalService {
  private assertLocalOwnership(session: { hosting: string | null; createdById: string }, userId: string): void {
    if (session.hosting === "local" && session.createdById !== userId) {
      throw new Error("Access denied: you can only access terminals on your own local sessions");
    }
  }

  async create({
    sessionId,
    cols,
    rows,
    organizationId,
    userId,
  }: {
    sessionId: string;
    cols: number;
    rows: number;
    organizationId: string;
    userId: string;
  }): Promise<{ id: string; sessionId: string }> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: {
        id: true,
        sessionGroupId: true,
        hosting: true,
        createdById: true,
        agentStatus: true,
        sessionStatus: true,
        sessionGroup: {
          select: {
            workdir: true,
            worktreeDeleted: true,
          },
        },
      },
    });
    if (!session) throw new Error("Session not found");
    if (isFullyUnloadedSession(session.agentStatus, session.sessionStatus)) {
      throw new Error(`Cannot create terminal on a ${session.agentStatus} session`);
    }
    if (session.sessionGroup?.worktreeDeleted) {
      throw new Error("Cannot create terminal: session worktree has been deleted");
    }
    this.assertLocalOwnership(session, userId);

    const terminalId = terminalRelay.createTerminal(
      sessionId,
      session.sessionGroupId ?? null,
      cols,
      rows,
      session.sessionGroup?.workdir ?? undefined,
    );
    return { id: terminalId, sessionId };
  }

  async listForSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<Array<{ id: string; sessionId: string }>> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true, sessionGroupId: true, hosting: true, createdById: true },
    });
    if (!session) throw new Error("Session not found");
    this.assertLocalOwnership(session, userId);

    const terminalIds = session.sessionGroupId
      ? terminalRelay.getTerminalsForSessionGroup(session.sessionGroupId)
      : terminalRelay.getTerminalsForSession(sessionId);
    const terminalSessionIds = terminalIds
      .map((id) => terminalRelay.getSessionId(id))
      .filter((id): id is string => !!id);

    const owningSessions = terminalSessionIds.length === 0
      ? []
      : await prisma.session.findMany({
          where: { id: { in: terminalSessionIds }, organizationId },
          select: { id: true, hosting: true, createdById: true },
        });
    const owningSessionMap = new Map(owningSessions.map((item) => [item.id, item]));

    return terminalIds.flatMap((id) => {
      const ownerSessionId = terminalRelay.getSessionId(id) ?? sessionId;
      const ownerSession = owningSessionMap.get(ownerSessionId);
      if (!ownerSession) return [];
      if (ownerSession.hosting === "local" && ownerSession.createdById !== userId) {
        return [];
      }
      return [{ id, sessionId: ownerSessionId }];
    });
  }

  async destroy({
    terminalId,
    organizationId,
    userId,
  }: {
    terminalId: string;
    organizationId: string;
    userId: string;
  }): Promise<boolean> {
    const sessionId = terminalRelay.getSessionId(terminalId);
    if (!sessionId) return true; // Already gone — no-op

    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true, hosting: true, createdById: true },
    });
    if (!session) throw new Error("Terminal not found");
    this.assertLocalOwnership(session, userId);

    terminalRelay.destroyTerminal(terminalId);
    return true;
  }
}

export const terminalService = new TerminalService();
