import { prisma } from "../lib/db.js";
import { terminalRelay } from "../lib/terminal-relay.js";

class TerminalService {
  async create({
    sessionId,
    cols,
    rows,
    organizationId,
  }: {
    sessionId: string;
    cols: number;
    rows: number;
    organizationId: string;
  }): Promise<{ id: string; sessionId: string }> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true, workdir: true },
    });
    if (!session) throw new Error("Session not found");

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
  }: {
    sessionId: string;
    organizationId: string;
  }): Promise<Array<{ id: string; sessionId: string }>> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true },
    });
    if (!session) throw new Error("Session not found");

    const terminalIds = terminalRelay.getTerminalsForSession(sessionId);
    return terminalIds.map((id) => ({ id, sessionId }));
  }

  async destroy({
    terminalId,
    organizationId,
  }: {
    terminalId: string;
    organizationId: string;
  }): Promise<boolean> {
    const sessionId = terminalRelay.getSessionId(terminalId);
    if (!sessionId) return true; // Already gone — no-op

    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true },
    });
    if (!session) throw new Error("Terminal not found");

    terminalRelay.destroyTerminal(terminalId);
    return true;
  }
}

export const terminalService = new TerminalService();
