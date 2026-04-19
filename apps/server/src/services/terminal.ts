import { prisma } from "../lib/db.js";
import { AuthorizationError } from "../lib/errors.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { runtimeAccessService } from "./runtime-access.js";
import { isFullyUnloadedSession } from "./session.js";

const TERMINAL_NO_RUNTIME_ERROR =
  "Cannot open terminal: this session is not connected to a runtime";

class TerminalService {
  private getConnectionRuntimeInstanceId(connection: unknown): string | null {
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      return null;
    }
    const runtimeInstanceId = (connection as { runtimeInstanceId?: unknown }).runtimeInstanceId;
    return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
      ? runtimeInstanceId
      : null;
  }

  private resolveSessionRuntimeInstanceId(session: {
    id: string;
    connection: unknown;
    sessionGroup?: { connection?: unknown } | null;
  }): string | null {
    return (
      this.getConnectionRuntimeInstanceId(session.connection) ??
      this.getConnectionRuntimeInstanceId(session.sessionGroup?.connection) ??
      sessionRouter.getRuntimeForSession(session.id)?.id ??
      null
    );
  }

  /**
   * Enforce bridge access for a terminal op and resolve the runtime the op
   * should target.
   *   - "throw":  no runtime resolves  → throw (create path — we need a bound runtime)
   *   - "deny":   no runtime resolves  → return null (list/destroy — fail closed silently)
   * Returns the resolved runtime id once access has been asserted. Callers
   * MUST pin any downstream `sessionRouter.send` to this id so the command
   * can't fall through to a different tenant's bridge.
   */
  private async assertTerminalAccess(
    session: {
      id: string;
      organizationId: string;
      sessionGroupId: string | null;
      connection: unknown;
      sessionGroup?: { connection?: unknown } | null;
    },
    userId: string,
    onMissingRuntime: "throw" | "deny",
  ): Promise<string | null> {
    const runtimeInstanceId = this.resolveSessionRuntimeInstanceId(session);
    if (!runtimeInstanceId) {
      if (onMissingRuntime === "throw") {
        throw new AuthorizationError(TERMINAL_NO_RUNTIME_ERROR);
      }
      return null;
    }
    await runtimeAccessService.assertAccess({
      userId,
      organizationId: session.organizationId,
      runtimeInstanceId,
      sessionGroupId: session.sessionGroupId,
      capability: "terminal",
    });
    return runtimeInstanceId;
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
        organizationId: true,
        sessionGroupId: true,
        connection: true,
        agentStatus: true,
        sessionStatus: true,
        sessionGroup: {
          select: {
            workdir: true,
            worktreeDeleted: true,
            setupStatus: true,
            connection: true,
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
    if (session.sessionGroup?.setupStatus === "running") {
      throw new Error("Cannot create terminal while the setup script is still running");
    }
    const runtimeInstanceId = await this.assertTerminalAccess(session, userId, "throw");
    if (!runtimeInstanceId) {
      // assertTerminalAccess with "throw" either returns a runtime or throws.
      throw new AuthorizationError(TERMINAL_NO_RUNTIME_ERROR);
    }

    const terminalId = terminalRelay.createTerminal(
      sessionId,
      session.sessionGroupId ?? null,
      runtimeInstanceId,
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
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        connection: true,
        sessionGroup: { select: { connection: true } },
      },
    });
    if (!session) throw new Error("Session not found");
    const runtimeInstanceId = await this.assertTerminalAccess(session, userId, "deny");
    if (!runtimeInstanceId) return [];

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
          select: {
            id: true,
            organizationId: true,
            sessionGroupId: true,
            connection: true,
            sessionGroup: { select: { connection: true } },
          },
        });
    type OwningSession = {
      id: string;
      organizationId: string;
      sessionGroupId: string | null;
      connection: unknown;
      sessionGroup: { connection: unknown } | null;
    };
    const owningSessionMap = new Map<string, OwningSession>(owningSessions.map((item: OwningSession) => [item.id, item]));

    const results: Array<{ id: string; sessionId: string }> = [];
    for (const id of terminalIds) {
      const ownerSessionId = terminalRelay.getSessionId(id) ?? sessionId;
      const ownerSession = owningSessionMap.get(ownerSessionId);
      if (!ownerSession) continue;
      try {
        const ownerRuntimeId = await this.assertTerminalAccess(ownerSession, userId, "deny");
        if (!ownerRuntimeId) continue;
        results.push({ id, sessionId: ownerSessionId });
      } catch {
        continue;
      }
    }

    return results;
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
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        connection: true,
        sessionGroup: { select: { connection: true } },
      },
    });
    if (!session) throw new Error("Terminal not found");
    const runtimeInstanceId = await this.assertTerminalAccess(session, userId, "deny");
    if (!runtimeInstanceId) return true;

    terminalRelay.destroyTerminal(terminalId);
    return true;
  }
}

export const terminalService = new TerminalService();
