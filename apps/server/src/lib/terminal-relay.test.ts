import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  send: vi.fn(() => "delivered"),
  sendAsync: vi.fn(),
  sendToRuntime: vi.fn(() => "delivered"),
  sendToRuntimeAsync: vi.fn(),
  isRuntimeGenerationCurrent: vi.fn(() => true),
  sessionFindMany: vi.fn(),
  channelFindMany: vi.fn(),
  terminalDirectoryGet: vi.fn(),
  terminalDirectoryRegister: vi.fn(),
  terminalDirectoryRemove: vi.fn(),
  terminalDirectoryInvalidate: vi.fn(),
  backplaneSend: vi.fn(() => Promise.resolve()),
  backplaneHandlers: new Map<
    string,
    Array<(envelope: { sourceReplicaId: string; payload: unknown }) => void>
  >(),
}));

vi.mock("./session-router.js", () => ({
  runtimeRouterKey: (runtimeInstanceId: string, organizationId: string) =>
    `${organizationId}:${runtimeInstanceId}`,
  sessionRouter: {
    getRuntime: mocks.getRuntime,
    send: mocks.send,
    sendAsync: mocks.sendAsync,
    sendToRuntime: mocks.sendToRuntime,
    sendToRuntimeAsync: mocks.sendToRuntimeAsync,
    isRuntimeGenerationCurrent: mocks.isRuntimeGenerationCurrent,
  },
}));

vi.mock("./db.js", () => ({
  prisma: {
    session: { findMany: mocks.sessionFindMany },
    channel: { findMany: mocks.channelFindMany },
  },
}));

vi.mock("./terminal-directory.js", () => ({
  terminalDirectory: {
    get: mocks.terminalDirectoryGet,
    register: mocks.terminalDirectoryRegister,
    remove: mocks.terminalDirectoryRemove,
    invalidate: mocks.terminalDirectoryInvalidate,
  },
}));

vi.mock("./realtime-backplane.js", () => ({
  realtimeBackplane: {
    replicaId: "replica-local",
    send: mocks.backplaneSend,
    on: vi.fn(
      (
        kind: string,
        handler: (envelope: { sourceReplicaId: string; payload: unknown }) => void,
      ) => {
        const handlers = mocks.backplaneHandlers.get(kind) ?? [];
        handlers.push(handler);
        mocks.backplaneHandlers.set(kind, handlers);
        return () => undefined;
      },
    ),
  },
}));

import { TerminalRelay } from "./terminal-relay.js";

/** Make the (mocked) owning replica confirm every cross-replica attach. */
function acknowledgeRemoteAttaches(): void {
  mocks.backplaneSend.mockImplementation(((
    _target: string,
    kind: string,
    payload: { terminalId?: string; attachmentId?: string },
  ) => {
    if (kind === "terminal_frontend_attach") {
      mocks.backplaneHandlers.get("terminal_frontend_attach_result")?.at(-1)?.({
        sourceReplicaId: "replica-owner",
        payload: { ...payload, attached: true },
      });
    }
    return Promise.resolve();
  }) as never);
}

function createOpenWs() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
  };
}

describe("TerminalRelay runtime identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backplaneHandlers.clear();
    mocks.getRuntime.mockImplementation((runtimeId: string, organizationId?: string | null) => {
      if (
        runtimeId === "bridge-1" ||
        runtimeId === "org-1:bridge-1" ||
        (runtimeId === "bridge-1" && organizationId === "org-1")
      ) {
        return {
          id: "bridge-1",
          key: "org-1:bridge-1",
          organizationId: "org-1",
          ws: { OPEN: 1, readyState: 1 },
        };
      }
      return undefined;
    });
    mocks.sessionFindMany.mockResolvedValue([]);
    mocks.channelFindMany.mockResolvedValue([]);
    mocks.sendAsync.mockImplementation((...args: unknown[]) =>
      Promise.resolve(mocks.send(...args)),
    );
    mocks.sendToRuntimeAsync.mockImplementation((...args: unknown[]) =>
      Promise.resolve(mocks.sendToRuntime(...args)),
    );
    mocks.isRuntimeGenerationCurrent.mockReturnValue(true);
    mocks.terminalDirectoryGet.mockResolvedValue(undefined);
    mocks.backplaneSend.mockImplementation((() => Promise.resolve()) as never);
  });

  it("accepts bridge terminal messages from the org-scoped runtime key", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();

    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    relay.attachFrontend(terminalId, ws as never, "user-1");

    await relay.relayFromBridge({ type: "terminal_ready", terminalId }, "org-1:bridge-1");
    await relay.relayFromBridge(
      { type: "terminal_output", terminalId, data: "hello" },
      "org-1:bridge-1",
    );

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ready" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "output", data: "hello" }));
  });

  it("accepts bridge terminal messages when the creating replica does not own the bridge socket", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    // The replica serving the createTerminal mutation holds no socket for this
    // runtime, so it cannot look the org-scoped router key up locally.
    mocks.getRuntime.mockReturnValue(undefined);

    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    relay.attachFrontend(terminalId, ws as never, "user-1");

    await relay.relayFromBridge({ type: "terminal_ready", terminalId }, "org-1:bridge-1");
    await relay.relayFromBridge(
      { type: "terminal_output", terminalId, data: "hello" },
      "org-1:bridge-1",
    );

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ready" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "output", data: "hello" }));
  });

  it("reports an undeliverable terminal_create to an already-attached frontend", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    mocks.send.mockReturnValueOnce("runtime_disconnected");

    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    relay.attachFrontend(terminalId, ws as never, "user-1");
    await vi.waitFor(() =>
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "error",
          message: "Terminal creation failed: runtime_disconnected",
        }),
      ),
    );
  });

  it("ignores terminal messages from a superseded runtime generation", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    relay.attachFrontend(terminalId, ws as never, "user-1");
    mocks.isRuntimeGenerationCurrent.mockReturnValue(false);

    await relay.relayFromBridge(
      { type: "terminal_output", terminalId, data: "stale" },
      "org-1:bridge-1",
      "generation-old",
    );

    expect(mocks.isRuntimeGenerationCurrent).toHaveBeenCalledWith(
      "org-1:bridge-1",
      "generation-old",
    );
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("keeps restored terminal auth IDs external while matching the org-scoped runtime key", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    mocks.sessionFindMany.mockResolvedValueOnce([
      { id: "session-1", sessionGroupId: "group-1", organizationId: "org-1" },
    ]);

    await relay.restoreTerminals("org-1:bridge-1", [
      { terminalId: "term-1", sessionId: "session-1", ownerUserId: "user-1" },
    ]);
    relay.attachFrontend("term-1", ws as never, "user-1");
    await relay.relayFromBridge({ type: "terminal_ready", terminalId: "term-1" }, "org-1:bridge-1");

    expect(relay.getTerminalAuthContext("term-1")).toMatchObject({
      kind: "session",
      runtimeInstanceId: "bridge-1",
      ownerUserId: "user-1",
    });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ready" }));
  });

  it("preserves restored terminal ownership", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    mocks.sessionFindMany.mockResolvedValueOnce([
      { id: "session-1", sessionGroupId: "group-1", organizationId: "org-1" },
    ]);

    await relay.restoreTerminals("org-1:bridge-1", [
      { terminalId: "term-1", sessionId: "session-1", ownerUserId: "user-1" },
    ]);
    expect(relay.getTerminalAuthContext("term-1")).toMatchObject({ ownerUserId: "user-1" });

    relay.attachFrontend("term-1", ws as never, "user-2");

    expect(relay.getTerminalAuthContext("term-1")).toMatchObject({ ownerUserId: "user-1" });
  });

  it("scopes restored session and channel terminal lookups to the runtime organization", async () => {
    const relay = new TerminalRelay();
    mocks.sessionFindMany.mockResolvedValueOnce([]);
    mocks.channelFindMany.mockResolvedValueOnce([]);

    await relay.restoreTerminals("org-1:bridge-1", [
      { terminalId: "session-term", sessionId: "session-from-other-org", ownerUserId: "user-1" },
      {
        terminalId: "channel-term",
        sessionId: "channel:channel-from-other-org",
        ownerUserId: "user-1",
      },
    ]);

    expect(mocks.sessionFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["session-from-other-org"] }, organizationId: "org-1" },
      select: { id: true, sessionGroupId: true, organizationId: true },
    });
    expect(mocks.channelFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["channel-from-other-org"] }, organizationId: "org-1" },
      select: { id: true, organizationId: true, repoId: true },
    });
    expect(relay.getTerminalAuthContext("session-term")).toBeNull();
    expect(relay.getTerminalAuthContext("channel-term")).toBeNull();
  });

  it("does not let a stale distributed detach clear a replacement frontend", async () => {
    const relay = new TerminalRelay();
    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    const attach = mocks.backplaneHandlers.get("terminal_frontend_attach")?.at(-1);
    const detach = mocks.backplaneHandlers.get("terminal_frontend_detach")?.at(-1);

    attach?.({
      sourceReplicaId: "replica-frontend",
      payload: { terminalId, attachmentId: "attachment-old", userId: "user-1" },
    });
    attach?.({
      sourceReplicaId: "replica-frontend",
      payload: { terminalId, attachmentId: "attachment-new", userId: "user-1" },
    });
    detach?.({
      sourceReplicaId: "replica-frontend",
      payload: { terminalId, attachmentId: "attachment-old" },
    });
    mocks.backplaneSend.mockClear();

    await relay.relayFromBridge(
      { type: "terminal_output", terminalId, data: "still connected" },
      "org-1:bridge-1",
    );

    expect(mocks.backplaneSend).toHaveBeenCalledWith(
      "replica-frontend",
      "terminal_frontend_messages",
      {
        terminalId,
        attachmentId: "attachment-new",
        messages: [JSON.stringify({ type: "output", data: "still connected" })],
      },
    );
  });

  it("accepts commands only from the current distributed attachment", () => {
    const relay = new TerminalRelay();
    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    const attach = mocks.backplaneHandlers.get("terminal_frontend_attach")?.at(-1);
    const command = mocks.backplaneHandlers.get("terminal_frontend_command")?.at(-1);

    attach?.({
      sourceReplicaId: "replica-frontend",
      payload: { terminalId, attachmentId: "attachment-old", userId: "user-1" },
    });
    attach?.({
      sourceReplicaId: "replica-frontend",
      payload: { terminalId, attachmentId: "attachment-new", userId: "user-1" },
    });
    mocks.sendAsync.mockClear();

    command?.({
      sourceReplicaId: "replica-frontend",
      payload: {
        terminalId,
        attachmentId: "attachment-old",
        commandType: "input",
        payload: { data: "stale" },
      },
    });
    expect(mocks.sendAsync).not.toHaveBeenCalled();

    command?.({
      sourceReplicaId: "replica-frontend",
      payload: {
        terminalId,
        attachmentId: "attachment-new",
        commandType: "input",
        payload: { data: "current" },
      },
    });
    expect(mocks.sendAsync).toHaveBeenCalledWith(
      "session-1",
      { type: "terminal_input", terminalId, data: "current" },
      { expectedHomeRuntimeId: "bridge-1", organizationId: "org-1" },
    );
  });

  it("forwards proxy commands with the active attachment identity", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    mocks.terminalDirectoryGet.mockResolvedValue({
      terminalId: "term-remote",
      frontendReplicaId: "replica-owner",
    });
    acknowledgeRemoteAttaches();

    await relay.attachFrontendDistributed("term-remote", ws as never, "user-1");
    const attachPayload = mocks.backplaneSend.mock.calls.at(-1)?.[2] as
      | { attachmentId?: string }
      | undefined;
    mocks.backplaneSend.mockClear();

    relay.relayFromFrontend("term-remote", "input", { data: "hello" });
    await vi.waitFor(() => {
      expect(mocks.backplaneSend).toHaveBeenCalledWith(
        "replica-owner",
        "terminal_frontend_command",
        {
          terminalId: "term-remote",
          attachmentId: attachPayload?.attachmentId,
          commandType: "input",
          payload: { data: "hello" },
        },
      );
    });
  });

  it("rejects a cross-replica attach the owning replica no longer holds", async () => {
    const relay = new TerminalRelay();
    const ws = createOpenWs();
    mocks.terminalDirectoryGet.mockResolvedValue({
      terminalId: "term-remote",
      frontendReplicaId: "replica-owner",
    });
    // The owning replica restarted: it answers, but without the terminal.
    mocks.backplaneSend.mockImplementation(((
      _target: string,
      kind: string,
      payload: { attachmentId?: string },
    ) => {
      if (kind === "terminal_frontend_attach") {
        mocks.backplaneHandlers.get("terminal_frontend_attach_result")?.at(-1)?.({
          sourceReplicaId: "replica-owner",
          payload: { ...payload, attached: false },
        });
      }
      return Promise.resolve();
    }) as never);

    await expect(
      relay.attachFrontendDistributed("term-remote", ws as never, "user-1"),
    ).resolves.toBe(false);
    expect(mocks.terminalDirectoryInvalidate).toHaveBeenCalledWith("term-remote");
  });

  it("rejects a cross-replica attach the owning replica never confirms", async () => {
    vi.useFakeTimers();
    try {
      const relay = new TerminalRelay();
      const ws = createOpenWs();
      mocks.terminalDirectoryGet.mockResolvedValue({
        terminalId: "term-remote",
        frontendReplicaId: "replica-gone",
      });

      const attached = relay.attachFrontendDistributed("term-remote", ws as never, "user-1");
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(attached).resolves.toBe(false);
      expect(mocks.terminalDirectoryInvalidate).toHaveBeenCalledWith("term-remote");
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes a destroy to the replica that owns the terminal", async () => {
    const relay = new TerminalRelay();
    mocks.terminalDirectoryGet.mockResolvedValue({
      terminalId: "term-remote",
      frontendReplicaId: "replica-owner",
    });
    mocks.backplaneSend.mockImplementation(((
      _target: string,
      kind: string,
      payload: { requestId?: string },
    ) => {
      if (kind === "terminal_destroy_request") {
        mocks.backplaneHandlers.get("terminal_destroy_result")?.at(-1)?.({
          sourceReplicaId: "replica-owner",
          payload: { requestId: payload.requestId, destroyed: true },
        });
      }
      return Promise.resolve();
    }) as never);

    await expect(relay.destroyTerminalDistributed("term-remote")).resolves.toBe(true);
    expect(mocks.backplaneSend).toHaveBeenCalledWith(
      "replica-owner",
      "terminal_destroy_request",
      expect.objectContaining({ terminalId: "term-remote" }),
    );
    expect(mocks.terminalDirectoryRemove).not.toHaveBeenCalled();
  });

  it("drops the routing record when the owning replica never confirms a destroy", async () => {
    vi.useFakeTimers();
    try {
      const relay = new TerminalRelay();
      mocks.terminalDirectoryGet.mockResolvedValue({
        terminalId: "term-remote",
        frontendReplicaId: "replica-gone",
      });

      const destroyed = relay.destroyTerminalDistributed("term-remote");
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(destroyed).resolves.toBe(true);
      expect(mocks.terminalDirectoryRemove).toHaveBeenCalledWith("term-remote");
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroys a locally held terminal on behalf of another replica", async () => {
    const relay = new TerminalRelay();
    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    mocks.backplaneSend.mockClear();

    mocks.backplaneHandlers.get("terminal_destroy_request")?.at(-1)?.({
      sourceReplicaId: "replica-requester",
      payload: { terminalId, requestId: "request-1" },
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ type: "terminal_destroy", terminalId }),
      expect.anything(),
    );
    expect(relay.getTerminalAuthContext(terminalId)).toBeNull();
    expect(mocks.backplaneSend).toHaveBeenCalledWith(
      "replica-requester",
      "terminal_destroy_result",
      { requestId: "request-1", destroyed: true },
    );
  });

  it("revokes a remotely attached terminal for its authenticated user", () => {
    const relay = new TerminalRelay();
    const terminalId = relay.createTerminal(
      "session-1",
      "group-1",
      "org-1",
      "bridge-1",
      "user-1",
      80,
      24,
      "/repo",
    );
    const attach = mocks.backplaneHandlers.get("terminal_frontend_attach")?.at(-1);
    attach?.({
      sourceReplicaId: "replica-frontend",
      payload: { terminalId, attachmentId: "attachment-1", userId: "user-1" },
    });
    mocks.backplaneSend.mockClear();

    relay.destroyTerminalsForUser("user-1", new Set(["session-1"]));

    expect(mocks.backplaneSend).toHaveBeenCalledWith(
      "replica-frontend",
      "terminal_frontend_messages",
      {
        terminalId,
        attachmentId: "attachment-1",
        messages: [JSON.stringify({ type: "error", message: "Bridge access revoked" })],
      },
    );
    expect(relay.getTerminalAuthContext(terminalId)).toBeNull();
  });
});
