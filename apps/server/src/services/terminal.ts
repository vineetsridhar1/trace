import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { canViewSessionGroup } from "./access.js";
import { runtimeAccessService } from "./runtime-access.js";
import { isFullyUnloadedSession } from "./session.js";

const TERMINAL_NO_RUNTIME_ERROR =
  "Cannot open terminal: this session is not connected to a runtime";

class TerminalService {
  private static readonly MAX_CAPTURE_BYTES = 50 * 1024;
  private static readonly MAX_INPUT_BYTES = 16 * 1024;
  private static readonly MIN_COLS = 20;
  private static readonly MAX_COLS = 500;
  private static readonly MIN_ROWS = 5;
  private static readonly MAX_ROWS = 200;

  private validateDimensions(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || cols < TerminalService.MIN_COLS || cols > TerminalService.MAX_COLS || !Number.isInteger(rows) || rows < TerminalService.MIN_ROWS || rows > TerminalService.MAX_ROWS) {
      throw new ValidationError(`Terminal dimensions must be ${TerminalService.MIN_COLS}-${TerminalService.MAX_COLS} columns and ${TerminalService.MIN_ROWS}-${TerminalService.MAX_ROWS} rows`);
    }
  }

  private validateInput(data: string): void {
    if (Buffer.byteLength(data, "utf8") > TerminalService.MAX_INPUT_BYTES) throw new ValidationError("Terminal input exceeds 16384 bytes");
    if (/[\u0000-\u0002\u0005-\u0008\u000b\u000e-\u001f\u007f-\u009f]/.test(data)) {
      throw new ValidationError("Terminal input contains unsupported control bytes");
    }
  }
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
      this.getConnectionRuntimeInstanceId(session.sessionGroup?.connection) ??
      this.getConnectionRuntimeInstanceId(session.connection) ??
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
      sessionGroup?: {
        connection?: unknown;
        visibility?: string | null;
        ownerUserId?: string | null;
      } | null;
    },
    userId: string,
    onMissingRuntime: "throw" | "deny",
  ): Promise<string | null> {
    if (session.sessionGroup && !canViewSessionGroup(session.sessionGroup, userId)) {
      if (onMissingRuntime === "throw") {
        throw new AuthorizationError("Not authorized for this session");
      }
      return null;
    }
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

  private async resolveChannelTerminalTarget(input: {
    channelId: string;
    bridgeRuntimeId: string;
    organizationId: string;
    userId: string;
    requireRepoPath: boolean;
  }): Promise<{
    channelId: string;
    repoId: string;
    runtimeInstanceId: string;
    repoPath: string | null;
  }> {
    const channel = await prisma.channel.findFirst({
      where: {
        id: input.channelId,
        organizationId: input.organizationId,
        type: "coding",
        members: { some: { userId: input.userId, leftAt: null } },
      },
      select: { id: true, repoId: true },
    });
    if (!channel?.repoId) throw new Error("Channel not found");

    const bridge = await prisma.bridgeRuntime.findFirst({
      where: {
        organizationId: input.organizationId,
        OR: [{ id: input.bridgeRuntimeId }, { instanceId: input.bridgeRuntimeId }],
      },
      select: { instanceId: true },
    });
    if (!bridge) throw new Error("Bridge not found");

    const runtime = sessionRouter.getRuntimeMetadata(bridge.instanceId, input.organizationId);
    if (!runtime || !sessionRouter.isRuntimeAvailable(runtime.id, input.organizationId)) {
      throw new AuthorizationError(TERMINAL_NO_RUNTIME_ERROR);
    }
    if (runtime.organizationId !== input.organizationId) {
      throw new AuthorizationError(TERMINAL_NO_RUNTIME_ERROR);
    }
    if (runtime.hostingMode === "local" && !runtime.registeredRepoIds.includes(channel.repoId)) {
      throw new Error("Repo is not linked on this bridge");
    }

    await runtimeAccessService.assertAccess({
      userId: input.userId,
      organizationId: input.organizationId,
      runtimeInstanceId: runtime.id,
      capability: "terminal",
    });

    let repoPath: string | null = null;
    if (input.requireRepoPath) {
      const status = await sessionRouter.getLinkedCheckoutStatus(runtime.key, channel.repoId);
      repoPath = status.repoPath ?? null;
      if (!repoPath) throw new Error("Repo is not linked on this bridge");
    }

    return {
      channelId: channel.id,
      repoId: channel.repoId,
      runtimeInstanceId: runtime.id,
      repoPath,
    };
  }

  async create({
    sessionId,
    cols,
    rows,
    organizationId,
    userId,
    agentSessionId,
  }: {
    sessionId: string;
    cols: number;
    rows: number;
    organizationId: string;
    userId: string;
    agentSessionId?: string | null;
  }): Promise<{ id: string; sessionId: string }> {
    this.validateDimensions(cols, rows);
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
            visibility: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!session) throw new Error("Session not found");
    if (agentSessionId && agentSessionId !== session.id && agentSessionId !== session.sessionGroupId) {
      const agentSession = await prisma.session.findFirst({ where: { id: agentSessionId, organizationId }, select: { sessionGroupId: true } });
      if (!agentSession || !agentSession.sessionGroupId || agentSession.sessionGroupId !== session.sessionGroupId) throw new AuthorizationError("Session credential cannot access this terminal");
    }
    if (
      isFullyUnloadedSession(
        session.agentStatus,
        session.sessionStatus,
        session.sessionGroup?.worktreeDeleted,
      )
    ) {
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
      session.organizationId,
      runtimeInstanceId,
      userId,
      cols,
      rows,
      session.sessionGroup?.workdir ?? undefined,
    );
    return terminalRelay.getTerminalState(terminalId) ?? { id: terminalId, sessionId, status: "connecting", cols, rows, connected: true, closed: false };
  }

  async listForSession({
    sessionId,
    organizationId,
    userId,
    agentSessionId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
    agentSessionId?: string | null;
  }): Promise<Array<{ id: string; sessionId: string }>> {
    if (agentSessionId && agentSessionId !== sessionId) {
      const [requested, agent] = await Promise.all([
        prisma.session.findFirst({ where: { id: sessionId, organizationId }, select: { sessionGroupId: true } }),
        prisma.session.findFirst({ where: { id: agentSessionId, organizationId }, select: { sessionGroupId: true } }),
      ]);
      if (!requested || !agent?.sessionGroupId || requested.sessionGroupId !== agent.sessionGroupId) throw new AuthorizationError("Session credential cannot access this terminal");
    }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        connection: true,
        sessionGroup: { select: { connection: true, visibility: true, ownerUserId: true } },
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

    const owningSessions =
      terminalSessionIds.length === 0
        ? []
        : await prisma.session.findMany({
            where: { id: { in: terminalSessionIds }, organizationId },
            select: {
              id: true,
              organizationId: true,
              sessionGroupId: true,
              connection: true,
              sessionGroup: { select: { connection: true, visibility: true, ownerUserId: true } },
            },
          });
    type OwningSession = {
      id: string;
      organizationId: string;
      sessionGroupId: string | null;
      connection: unknown;
      sessionGroup: {
        connection: unknown;
        visibility?: string | null;
        ownerUserId?: string | null;
      } | null;
    };
    const owningSessionMap = new Map<string, OwningSession>(
      owningSessions.map((item: OwningSession) => [item.id, item]),
    );

    const results: Array<{ id: string; sessionId: string; status: string; cols: number; rows: number; connected: boolean; closed: boolean }> = [];
    for (const id of terminalIds) {
      const authContext = terminalRelay.getTerminalAuthContext(id);
      if (!authContext || authContext.ownerUserId !== userId) continue;
      const ownerSessionId = terminalRelay.getSessionId(id) ?? sessionId;
      const ownerSession = owningSessionMap.get(ownerSessionId);
      if (!ownerSession) continue;
      try {
        const ownerRuntimeId = await this.assertTerminalAccess(ownerSession, userId, "deny");
        if (!ownerRuntimeId) continue;
        const state = terminalRelay.getTerminalState(id);
        if (state) results.push(state);
      } catch {
        continue;
      }
    }

    return results;
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
  }): Promise<{ id: string; sessionId: string }> {
    const target = await this.resolveChannelTerminalTarget({
      channelId,
      bridgeRuntimeId,
      organizationId,
      userId,
      requireRepoPath: true,
    });
    if (!target.repoPath) throw new Error("Repo is not linked on this bridge");

    const terminalId = terminalRelay.createChannelTerminal(
      target.channelId,
      organizationId,
      target.repoId,
      target.runtimeInstanceId,
      userId,
      cols,
      rows,
      target.repoPath,
    );
    return { id: terminalId, sessionId: target.channelId };
  }

  async listForChannel({
    channelId,
    bridgeRuntimeId,
    organizationId,
    userId,
  }: {
    channelId: string;
    bridgeRuntimeId: string;
    organizationId: string;
    userId: string;
  }): Promise<Array<{ id: string; sessionId: string }>> {
    const target = await this.resolveChannelTerminalTarget({
      channelId,
      bridgeRuntimeId,
      organizationId,
      userId,
      requireRepoPath: false,
    });

    return terminalRelay
      .getTerminalsForChannel(target.channelId, target.runtimeInstanceId)
      .filter((id: string) => terminalRelay.getTerminalAuthContext(id)?.ownerUserId === userId)
      .map((id: string) => ({ id, sessionId: target.channelId }));
  }

  async destroy({
    terminalId,
    organizationId,
    userId,
    agentSessionId,
  }: {
    terminalId: string;
    organizationId: string;
    userId: string;
    agentSessionId?: string | null;
  }): Promise<boolean> {
    if (agentSessionId) await this.assertTerminalOperation(terminalId, organizationId, userId, agentSessionId);
    const authContext = await terminalRelay.getTerminalAuthContextDistributed(terminalId);
    if (!authContext) return true; // Already gone — no-op
    if (authContext.ownerUserId !== userId) throw new Error("Terminal not found");

    if (authContext.kind === "channel") {
      const channel = await prisma.channel.findFirst({
        where: {
          id: authContext.channelId,
          organizationId,
          members: { some: { userId, leftAt: null } },
        },
        select: { organizationId: true },
      });
      if (!channel) throw new Error("Terminal not found");
      await runtimeAccessService.assertAccess({
        userId,
        organizationId: channel.organizationId,
        runtimeInstanceId: authContext.runtimeInstanceId,
        capability: "terminal",
      });
      await terminalRelay.destroyTerminalDistributed(terminalId);
      return true;
    }

    const session = await prisma.session.findFirst({
      where: { id: authContext.sessionId, organizationId },
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        connection: true,
        sessionGroup: { select: { connection: true, visibility: true, ownerUserId: true } },
      },
    });
    if (!session) throw new Error("Terminal not found");
    const runtimeInstanceId = await this.assertTerminalAccess(session, userId, "deny");
    if (!runtimeInstanceId) return true;

    await terminalRelay.destroyTerminalDistributed(terminalId);
    return true;
  }

  private async assertTerminalOperation(terminalId: string, organizationId: string, userId: string, agentSessionId?: string | null): Promise<void> {
    const auth = await terminalRelay.getTerminalAuthContextDistributed(terminalId);
    if (!auth) throw new NotFoundError("Terminal", terminalId);
    if (auth.ownerUserId !== userId) throw new AuthorizationError("Not authorized for this terminal");
    if (auth.kind !== "session") throw new AuthorizationError("Not authorized for this terminal");
    const session = await prisma.session.findFirst({ where: { id: auth.sessionId, organizationId }, select: { id: true, organizationId: true, sessionGroupId: true, connection: true, sessionGroup: { select: { connection: true, visibility: true, ownerUserId: true } } } });
    if (!session) throw new NotFoundError("Terminal", terminalId);
    if (agentSessionId && agentSessionId !== session.id && agentSessionId !== session.sessionGroupId) {
      const agentSession = await prisma.session.findFirst({ where: { id: agentSessionId, organizationId }, select: { sessionGroupId: true } });
      if (!agentSession || !agentSession.sessionGroupId || agentSession.sessionGroupId !== session.sessionGroupId) throw new AuthorizationError("Session credential cannot access this terminal");
    }
    const runtimeInstanceId = await this.assertTerminalAccess(session, userId, "deny");
    if (!runtimeInstanceId || runtimeInstanceId !== auth.runtimeInstanceId) throw new AuthorizationError("Runtime disconnected");
  }

  async capture(input: { terminalId: string; maxBytes?: number | null; plainText?: boolean | null; organizationId: string; userId: string; agentSessionId?: string | null }) {
    const requested = input.maxBytes ?? TerminalService.MAX_CAPTURE_BYTES;
    if (!Number.isInteger(requested) || requested < 1 || requested > TerminalService.MAX_CAPTURE_BYTES) throw new ValidationError(`maxBytes must be between 1 and ${TerminalService.MAX_CAPTURE_BYTES}`);
    await this.assertTerminalOperation(input.terminalId, input.organizationId, input.userId, input.agentSessionId);
    const capture = await terminalRelay.captureTerminalDistributed(input.terminalId, requested) as
      | { output: string; byteCount: number; truncated: boolean; closed: boolean; connected: boolean }
      | null;
    if (!capture) throw new NotFoundError("Terminal", input.terminalId);
    const output = input.plainText ? capture.output.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-nq-uy=><~]))/g, "") : capture.output;
    return { terminalId: input.terminalId, output, byteCount: Buffer.byteLength(output), truncated: capture.truncated, capturedAt: new Date().toISOString(), closed: capture.closed, connected: capture.connected };
  }

  async sendInput(input: { terminalId: string; data: string; organizationId: string; userId: string; agentSessionId?: string | null }): Promise<boolean> {
    this.validateInput(input.data);
    await this.assertTerminalOperation(input.terminalId, input.organizationId, input.userId, input.agentSessionId);
    if (!(await terminalRelay.sendInputDistributed(input.terminalId, input.data))) throw new ValidationError("Terminal is closed");
    return true;
  }

  async resize(input: { terminalId: string; cols: number; rows: number; organizationId: string; userId: string; agentSessionId?: string | null }): Promise<boolean> {
    this.validateDimensions(input.cols, input.rows);
    await this.assertTerminalOperation(input.terminalId, input.organizationId, input.userId, input.agentSessionId);
    if (!(await terminalRelay.resizeTerminalDistributed(input.terminalId, input.cols, input.rows))) throw new ValidationError("Terminal is closed");
    return true;
  }
}

export const terminalService = new TerminalService();
