import { prisma } from "../lib/db.js";
import { AuthorizationError } from "../lib/errors.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay, type TerminalScope } from "../lib/terminal-relay.js";
import { runtimeAccessService } from "./runtime-access.js";
import { isFullyUnloadedSession } from "./session.js";

const TERMINAL_NO_RUNTIME_ERROR =
  "Cannot open terminal: this session is not connected to a runtime";

export interface TerminalRecord {
  id: string;
  sessionId: string | null;
  channelId: string | null;
  bridgeRuntimeId: string;
}

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

  private toRecord(id: string, scope: TerminalScope, bridgeRuntimeId: string): TerminalRecord {
    if (scope.kind === "session") {
      return {
        id,
        sessionId: scope.sessionId,
        channelId: null,
        bridgeRuntimeId,
      };
    }
    return {
      id,
      sessionId: null,
      channelId: scope.channelId,
      bridgeRuntimeId,
    };
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
  }): Promise<TerminalRecord> {
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
    return {
      id: terminalId,
      sessionId,
      channelId: null,
      bridgeRuntimeId: runtimeInstanceId,
    };
  }

  async createForChannel({
    channelId,
    bridgeRuntimeId,
    cols,
    rows,
    organizationId,
    userId,
  }: {
    channelId: string;
    bridgeRuntimeId: string;
    cols: number;
    rows: number;
    organizationId: string;
    userId: string;
  }): Promise<TerminalRecord> {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        members: { some: { userId, leftAt: null } },
      },
      select: { id: true, type: true, repoId: true, organizationId: true },
    });
    if (!channel) {
      throw new AuthorizationError("Not authorized for this channel");
    }
    if (channel.type !== "coding") {
      throw new Error("Channel terminals are only supported for coding channels");
    }
    if (!channel.repoId) {
      throw new Error("Channel has no linked repo");
    }

    const runtime = sessionRouter.getRuntime(bridgeRuntimeId);
    if (!runtime || runtime.ws.readyState !== runtime.ws.OPEN) {
      throw new Error("Bridge is not connected");
    }
    if (runtime.hostingMode !== "local") {
      throw new Error("Channel terminals are only supported on local bridges");
    }
    if (runtime.organizationId && runtime.organizationId !== organizationId) {
      throw new AuthorizationError("Bridge is not in this organization");
    }
    if (!runtime.registeredRepoIds.includes(channel.repoId)) {
      throw new Error("Bridge does not have this repo linked");
    }

    await runtimeAccessService.assertAccess({
      userId,
      organizationId,
      runtimeInstanceId: bridgeRuntimeId,
      sessionGroupId: null,
      capability: "terminal",
    });

    const terminalId = terminalRelay.createChannelTerminal({
      channelId: channel.id,
      repoId: channel.repoId,
      runtimeInstanceId: bridgeRuntimeId,
      cols,
      rows,
    });
    return {
      id: terminalId,
      sessionId: null,
      channelId: channel.id,
      bridgeRuntimeId,
    };
  }

  async listForSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<TerminalRecord[]> {
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
    type SessionScope = Extract<TerminalScope, { kind: "session" }>;
    type SessionScopedEntry = { id: string; scope: SessionScope };
    const scopedEntries: SessionScopedEntry[] = [];
    for (const id of terminalIds) {
      const scope = terminalRelay.getScope(id);
      if (!scope || scope.kind !== "session") continue;
      scopedEntries.push({ id, scope });
    }

    const ownerSessionIds = [...new Set(scopedEntries.map((e) => e.scope.sessionId))];
    const owningSessions =
      ownerSessionIds.length === 0
        ? []
        : await prisma.session.findMany({
            where: { id: { in: ownerSessionIds }, organizationId },
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
    const owningSessionMap = new Map<string, OwningSession>(
      owningSessions.map((item: OwningSession) => [item.id, item]),
    );

    const results: TerminalRecord[] = [];
    for (const { id, scope } of scopedEntries) {
      const ownerSession = owningSessionMap.get(scope.sessionId);
      if (!ownerSession) continue;
      try {
        const ownerRuntimeId = await this.assertTerminalAccess(ownerSession, userId, "deny");
        if (!ownerRuntimeId) continue;
        results.push(this.toRecord(id, scope, ownerRuntimeId));
      } catch {
        continue;
      }
    }

    return results;
  }

  async listForChannel({
    channelId,
    organizationId,
    userId,
  }: {
    channelId: string;
    organizationId: string;
    userId: string;
  }): Promise<TerminalRecord[]> {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        members: { some: { userId, leftAt: null } },
      },
      select: { id: true },
    });
    if (!channel) return [];

    const terminalIds = terminalRelay.getTerminalsForChannel(channelId);
    const results: TerminalRecord[] = [];
    for (const id of terminalIds) {
      const scope = terminalRelay.getScope(id);
      if (!scope || scope.kind !== "channel") continue;
      const runtimeInstanceId = terminalRelay.getRuntimeInstanceId(id);
      if (!runtimeInstanceId) continue;
      try {
        await runtimeAccessService.assertAccess({
          userId,
          organizationId,
          runtimeInstanceId,
          sessionGroupId: null,
          capability: "terminal",
        });
        results.push(this.toRecord(id, scope, runtimeInstanceId));
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
    const scope = terminalRelay.getScope(terminalId);
    if (!scope) return true; // Already gone — no-op

    if (scope.kind === "session") {
      const session = await prisma.session.findFirst({
        where: { id: scope.sessionId, organizationId },
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

    const channel = await prisma.channel.findFirst({
      where: {
        id: scope.channelId,
        organizationId,
        members: { some: { userId, leftAt: null } },
      },
      select: { id: true },
    });
    if (!channel) return true;
    const runtimeInstanceId = terminalRelay.getRuntimeInstanceId(terminalId);
    if (!runtimeInstanceId) return true;
    try {
      await runtimeAccessService.assertAccess({
        userId,
        organizationId,
        runtimeInstanceId,
        sessionGroupId: null,
        capability: "terminal",
      });
    } catch {
      return true;
    }
    terminalRelay.destroyTerminal(terminalId);
    return true;
  }
}

export const terminalService = new TerminalService();
