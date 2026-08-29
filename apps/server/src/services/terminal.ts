import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalDirectory } from "../lib/terminal-directory.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { canViewSessionGroup } from "./access.js";
import { runtimeAccessService } from "./runtime-access.js";
import { isFullyUnloadedSession } from "./session.js";
import { eventService } from "./event.js";
import type { ActorType } from "@trace/gql";

type TerminalListEntry = {
  id: string;
  sessionId: string;
  status: string;
  cols: number;
  rows: number;
  connected: boolean;
  closed: boolean;
};

type TerminalCandidate = {
  id: string;
  /** Session the terminal belongs to; null when the relay has no record of it. */
  ownerSessionId: string | null;
  ownerUserId: string | null;
  state: TerminalListEntry | null;
};

/**
 * A terminal listing scope. Mirrors the directory's index shape, plus the
 * runtime a channel listing is pinned to.
 */
type TerminalScope =
  | { kind: "session"; id: string }
  | { kind: "group"; id: string }
  | { kind: "channel"; id: string; runtimeInstanceId: string };

const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

type TerminalAccess =
  | { ok: true; runtimeInstanceId: string }
  | { ok: false; reason: "forbidden" | "no_runtime" };

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
    if (
      !Number.isInteger(cols) ||
      cols < TerminalService.MIN_COLS ||
      cols > TerminalService.MAX_COLS ||
      !Number.isInteger(rows) ||
      rows < TerminalService.MIN_ROWS ||
      rows > TerminalService.MAX_ROWS
    ) {
      throw new ValidationError(
        `Terminal dimensions must be ${TerminalService.MIN_COLS}-${TerminalService.MAX_COLS} columns and ${TerminalService.MIN_ROWS}-${TerminalService.MAX_ROWS} rows`,
      );
    }
  }

  private validateInput(data: string): void {
    if (Buffer.byteLength(data, "utf8") > TerminalService.MAX_INPUT_BYTES)
      throw new ValidationError("Terminal input exceeds 16384 bytes");
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
      this.getConnectionRuntimeInstanceId(session.connection) ??
      this.getConnectionRuntimeInstanceId(session.sessionGroup?.connection) ??
      sessionRouter.getRuntimeForSession(session.id)?.id ??
      null
    );
  }

  /**
   * Enforce bridge access for a terminal op and resolve the runtime the op
   * should target. Returns which of the two ways this can fail, because they
   * call for opposite handling: "forbidden" must never be turned into a
   * success, while "no_runtime" only means the PTY is unreachable — a close,
   * for instance, should still converge.
   *
   * Callers MUST pin any downstream `sessionRouter.send` to the returned
   * runtime id so the command can't fall through to a different tenant's
   * bridge.
   */
  private async resolveTerminalAccess(
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
  ): Promise<TerminalAccess> {
    if (session.sessionGroup && !canViewSessionGroup(session.sessionGroup, userId)) {
      return { ok: false, reason: "forbidden" };
    }
    const runtimeInstanceId = this.resolveSessionRuntimeInstanceId(session);
    if (!runtimeInstanceId) return { ok: false, reason: "no_runtime" };
    await runtimeAccessService.assertAccess({
      userId,
      organizationId: session.organizationId,
      runtimeInstanceId,
      sessionGroupId: session.sessionGroupId,
      capability: "terminal",
    });
    return { ok: true, runtimeInstanceId };
  }

  /** `resolveTerminalAccess`, for callers that cannot proceed without a runtime. */
  private async assertTerminalAccess(
    session: Parameters<TerminalService["resolveTerminalAccess"]>[0],
    userId: string,
  ): Promise<string> {
    const access = await this.resolveTerminalAccess(session, userId);
    if (access.ok) return access.runtimeInstanceId;
    throw new AuthorizationError(
      access.reason === "forbidden" ? "Not authorized for this session" : TERMINAL_NO_RUNTIME_ERROR,
    );
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

    const resolution = await sessionRouter.resolveRuntime(bridge.instanceId, input.organizationId);
    if (resolution.state === "unreachable") {
      throw new Error("Runtime routing is temporarily unavailable");
    }
    const runtime = resolution.state === "local" ? resolution.runtime : resolution.descriptor;
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
    clientMutationId,
    openInWorkspace,
    organizationId,
    userId,
    actorType,
    agentSessionId,
  }: {
    sessionId: string;
    cols: number;
    rows: number;
    clientMutationId?: string;
    openInWorkspace?: boolean;
    organizationId: string;
    userId: string;
    actorType: ActorType;
    agentSessionId?: string | null;
  }): Promise<{ id: string; sessionId: string }> {
    this.validateDimensions(cols, rows);
    if (clientMutationId && clientMutationId.length > 128) {
      throw new ValidationError("clientMutationId must be 128 characters or fewer");
    }
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
    if (
      agentSessionId &&
      agentSessionId !== session.id &&
      agentSessionId !== session.sessionGroupId
    ) {
      const agentSession = await prisma.session.findFirst({
        where: { id: agentSessionId, organizationId },
        select: { sessionGroupId: true },
      });
      if (
        !agentSession ||
        !agentSession.sessionGroupId ||
        agentSession.sessionGroupId !== session.sessionGroupId
      )
        throw new AuthorizationError("Session credential cannot access this terminal");
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
    const runtimeInstanceId = await this.assertTerminalAccess(session, userId);

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
    const terminal = terminalRelay.getTerminalState(terminalId) ?? {
      id: terminalId,
      sessionId,
      status: "connecting",
      cols,
      rows,
      connected: true,
      closed: false,
    };
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "terminal_created",
      payload: {
        ...(clientMutationId ? { clientMutationId } : {}),
        ...(openInWorkspace ? { openInWorkspace: true, targetUserId: userId } : {}),
        terminal: {
          id: terminal.id,
          sessionId,
          sessionGroupId: session.sessionGroupId,
          status: terminal.status,
          cols: terminal.cols,
          rows: terminal.rows,
          connected: terminal.connected,
          closed: terminal.closed,
        },
      },
      actorType,
      actorId: userId,
    });
    return terminal;
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
        prisma.session.findFirst({
          where: { id: sessionId, organizationId },
          select: { sessionGroupId: true },
        }),
        prisma.session.findFirst({
          where: { id: agentSessionId, organizationId },
          select: { sessionGroupId: true },
        }),
      ]);
      if (!requested || !agent?.sessionGroupId || requested.sessionGroupId !== agent.sessionGroupId)
        throw new AuthorizationError("Session credential cannot access this terminal");
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
    const access = await this.resolveTerminalAccess(session, userId);
    if (!access.ok) return [];

    const candidates = await this.terminalsInScope(
      session.sessionGroupId
        ? { kind: "group", id: session.sessionGroupId }
        : { kind: "session", id: sessionId },
    );
    const terminalSessionIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.ownerSessionId)
          .filter((id): id is string => id !== null),
      ),
    ];

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

    const results: TerminalListEntry[] = [];
    for (const candidate of candidates) {
      if (!candidate.state || candidate.ownerUserId !== userId || !candidate.ownerSessionId) {
        continue;
      }
      const ownerSession = owningSessionMap.get(candidate.ownerSessionId);
      if (!ownerSession) continue;
      try {
        const ownerAccess = await this.resolveTerminalAccess(ownerSession, userId);
        if (!ownerAccess.ok) continue;
        results.push(candidate.state);
      } catch {
        continue;
      }
    }

    return results;
  }

  /**
   * Every live terminal in a scope, from this replica's memory and from the
   * directory. One merge for every listing: a caller that only asked the local
   * relay would return a different answer on each replica behind the load
   * balancer.
   */
  private async terminalsInScope(scope: TerminalScope): Promise<TerminalCandidate[]> {
    const localIds =
      scope.kind === "group"
        ? terminalRelay.getTerminalsForSessionGroup(scope.id)
        : scope.kind === "session"
          ? terminalRelay.getTerminalsForSession(scope.id)
          : terminalRelay.getTerminalsForChannel(scope.id, scope.runtimeInstanceId);
    const held = new Set(localIds);
    const remote = (
      await terminalDirectory.listForScope({ kind: scope.kind, id: scope.id })
    ).filter(
      (descriptor) =>
        !held.has(descriptor.terminalId) &&
        // Channel terminals are indexed per channel but scoped per runtime: a
        // repo linked on two bridges must not show one bridge's terminals on
        // the other.
        (scope.kind !== "channel" || descriptor.runtimeInstanceId === scope.runtimeInstanceId),
    );

    return [
      ...localIds.map((id) => ({
        id,
        ownerSessionId: terminalRelay.getSessionId(id) ?? null,
        ownerUserId: terminalRelay.getTerminalAuthContext(id)?.ownerUserId ?? null,
        state: terminalRelay.getTerminalState(id),
      })),
      ...remote.map((descriptor) => ({
        id: descriptor.terminalId,
        ownerSessionId: descriptor.sessionId,
        ownerUserId: descriptor.ownerUserId,
        state: {
          id: descriptor.terminalId,
          sessionId: descriptor.sessionId,
          // A directory record only exists while the owning replica holds a
          // live terminal, so a resolved descriptor is a running terminal.
          status: "ready",
          cols: descriptor.cols ?? DEFAULT_TERMINAL_COLS,
          rows: descriptor.rows ?? DEFAULT_TERMINAL_ROWS,
          connected: sessionRouter.peekRuntimePresence(
            descriptor.runtimeInstanceId,
            descriptor.organizationId,
          ),
          closed: false,
        },
      })),
    ];
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

    // Same merge as the session listing: channel terminals are held by
    // whichever replica created them, so the local relay alone answers
    // differently depending on who serves the request.
    const candidates = await this.terminalsInScope({
      kind: "channel",
      id: target.channelId,
      runtimeInstanceId: target.runtimeInstanceId,
    });
    return candidates
      .filter((candidate) => candidate.ownerUserId === userId)
      .map((candidate) => ({ id: candidate.id, sessionId: target.channelId }));
  }

  async destroy({
    terminalId,
    organizationId,
    userId,
    actorType,
    agentSessionId,
  }: {
    terminalId: string;
    organizationId: string;
    userId: string;
    actorType: ActorType;
    agentSessionId?: string | null;
  }): Promise<boolean> {
    if (agentSessionId)
      await this.assertTerminalOperation(terminalId, organizationId, userId, agentSessionId);
    // Resolve through the directory: the terminal may be held by another
    // replica, and treating that as "already gone" leaves the PTY running and
    // lets the next list query hand the terminal back to the frontend.
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
    const access = await this.resolveTerminalAccess(session, userId);
    if (!access.ok && access.reason === "forbidden") throw new Error("Terminal not found");

    // A close has to converge. With no reachable runtime there is no PTY to
    // kill, but the relay entry and routing record must still go — otherwise
    // the terminal keeps coming back in listings and the user cannot get rid
    // of the tab.
    const outcome = await terminalRelay.destroyTerminalDistributed(terminalId);
    if (outcome === "unreachable") {
      console.warn(
        `[terminal] destroy could not reach the owning replica for ${terminalId}; dropped its routing record`,
      );
    }
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: session.id,
      eventType: "terminal_destroyed",
      payload: { terminalId, sessionId: session.id, sessionGroupId: session.sessionGroupId },
      actorType,
      actorId: userId,
    });
    return true;
  }

  private async assertTerminalOperation(
    terminalId: string,
    organizationId: string,
    userId: string,
    agentSessionId?: string | null,
  ): Promise<void> {
    const auth = await terminalRelay.getTerminalAuthContextDistributed(terminalId);
    if (!auth) throw new NotFoundError("Terminal", terminalId);
    if (auth.ownerUserId !== userId)
      throw new AuthorizationError("Not authorized for this terminal");
    if (auth.kind !== "session") throw new AuthorizationError("Not authorized for this terminal");
    const session = await prisma.session.findFirst({
      where: { id: auth.sessionId, organizationId },
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        connection: true,
        sessionGroup: { select: { connection: true, visibility: true, ownerUserId: true } },
      },
    });
    if (!session) throw new NotFoundError("Terminal", terminalId);
    if (
      agentSessionId &&
      agentSessionId !== session.id &&
      agentSessionId !== session.sessionGroupId
    ) {
      const agentSession = await prisma.session.findFirst({
        where: { id: agentSessionId, organizationId },
        select: { sessionGroupId: true },
      });
      if (
        !agentSession ||
        !agentSession.sessionGroupId ||
        agentSession.sessionGroupId !== session.sessionGroupId
      )
        throw new AuthorizationError("Session credential cannot access this terminal");
    }
    const access = await this.resolveTerminalAccess(session, userId);
    if (!access.ok) {
      throw new AuthorizationError(
        access.reason === "forbidden" ? "Not authorized for this terminal" : "Runtime disconnected",
      );
    }
    if (access.runtimeInstanceId !== auth.runtimeInstanceId)
      throw new AuthorizationError("Runtime disconnected");
  }

  async capture(input: {
    terminalId: string;
    maxBytes?: number | null;
    plainText?: boolean | null;
    organizationId: string;
    userId: string;
    agentSessionId?: string | null;
  }) {
    const requested = input.maxBytes ?? TerminalService.MAX_CAPTURE_BYTES;
    if (
      !Number.isInteger(requested) ||
      requested < 1 ||
      requested > TerminalService.MAX_CAPTURE_BYTES
    )
      throw new ValidationError(
        `maxBytes must be between 1 and ${TerminalService.MAX_CAPTURE_BYTES}`,
      );
    await this.assertTerminalOperation(
      input.terminalId,
      input.organizationId,
      input.userId,
      input.agentSessionId,
    );
    const capture = await terminalRelay.captureTerminalDistributed(input.terminalId, requested);
    const output = input.plainText
      ? capture.output.replace(
          /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-nq-uy=><~]))/g,
          "",
        )
      : capture.output;
    return {
      terminalId: input.terminalId,
      output,
      byteCount: Buffer.byteLength(output),
      truncated: capture.truncated,
      capturedAt: new Date().toISOString(),
      closed: capture.closed,
      connected: capture.connected,
    };
  }

  async sendInput(input: {
    terminalId: string;
    data: string;
    organizationId: string;
    userId: string;
    agentSessionId?: string | null;
  }): Promise<boolean> {
    this.validateInput(input.data);
    await this.assertTerminalOperation(
      input.terminalId,
      input.organizationId,
      input.userId,
      input.agentSessionId,
    );
    await terminalRelay.sendInputDistributed(input.terminalId, input.data);
    return true;
  }

  async resize(input: {
    terminalId: string;
    cols: number;
    rows: number;
    organizationId: string;
    userId: string;
    agentSessionId?: string | null;
  }): Promise<boolean> {
    this.validateDimensions(input.cols, input.rows);
    await this.assertTerminalOperation(
      input.terminalId,
      input.organizationId,
      input.userId,
      input.agentSessionId,
    );
    await terminalRelay.resizeTerminalDistributed(input.terminalId, input.cols, input.rows);
    return true;
  }
}

export const terminalService = new TerminalService();
