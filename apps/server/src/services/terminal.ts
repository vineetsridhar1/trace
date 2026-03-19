import { prisma } from "../lib/db.js";
import { terminalRelay } from "../lib/terminal-relay.js";

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
      select: { id: true, workdir: true, hosting: true, createdById: true },
    });
    if (!session) throw new Error("Session not found");
    this.assertLocalOwnership(session, userId);

    const terminalId = terminalRelay.createTerminal(
      sessionId,
      cols,
      rows,
      session.workdir ?? undefined,
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
      select: { id: true, hosting: true, createdById: true },
    });
    if (!session) throw new Error("Session not found");
    this.assertLocalOwnership(session, userId);

    const terminalIds = terminalRelay.getTerminalsForSession(sessionId);
    return terminalIds.map((id) => ({ id, sessionId }));
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
