import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../services/api-token.js", () => ({
  apiTokenService: { getDecryptedTokens: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../services/codex-credential.js", () => ({
  codexCredentialService: { getDecryptedCredential: vi.fn().mockResolvedValue(null) },
}));

/**
 * Shared harness state.
 *
 * `vi.mock` factories are hoisted above module-level declarations, and modules
 * imported by the router register backplane handlers at import time — so this
 * has to be hoisted with them.
 */
const harness = vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const { randomUUID } = await import("node:crypto");

  /**
   * Which replica is "this process" for the duration of a call.
   *
   * `realtimeBackplane.replicaId` is a per-process constant in production, so
   * two replicas cannot otherwise be modelled in one test process.
   * AsyncLocalStorage propagates across awaits and microtasks, which is what
   * makes the owner replica's queued command delivery see its own identity
   * rather than the caller's.
   */
  const replicaContext = new AsyncLocalStorage<string>();
  const here = () => replicaContext.getStore() ?? "replica-unset";

  type Registration = {
    replica: string;
    kind: string;
    handler: (envelope: unknown) => unknown;
  };
  type Descriptor = {
    key: string;
    id: string;
    organizationId?: string;
    ownerReplicaId: string;
    connectionGeneration: string;
    ownershipEpoch: number;
    expiresAt: number;
    supportedTools: string[];
    protocolVersion?: number;
    [field: string]: unknown;
  };

  const registrations: Registration[] = [];
  /** Redis is shared across replicas; the mirror is per-replica. */
  const redisStore = new Map<string, Descriptor>();
  const mirrors = new Map<string, Map<string, Descriptor>>();
  const state = {
    ownershipEpoch: 0,
    redisReadable: true,
    failNextNonProbeAck: false,
    failNextAck: false,
  };

  function mirror(): Map<string, Descriptor> {
    const existing = mirrors.get(here());
    if (existing) return existing;
    const created = new Map<string, Descriptor>();
    mirrors.set(here(), created);
    return created;
  }

  function findIn(store: Map<string, Descriptor>, id: string, organizationId?: string | null) {
    const direct = store.get(organizationId ? `${organizationId}:${id}` : id);
    if (direct) return direct;
    const matches = [...store.values()].filter(
      (item) =>
        item.id === id && (organizationId == null || item.organizationId === organizationId),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  const backplane = {
    enabled: true,
    get replicaId() {
      return here();
    },
    on(kind: string, handler: (envelope: unknown) => unknown) {
      const entry = { replica: here(), kind, handler };
      registrations.push(entry);
      return () => {
        const index = registrations.indexOf(entry);
        if (index >= 0) registrations.splice(index, 1);
      };
    },
    async send(targetReplicaId: string, kind: string, payload: unknown) {
      if (kind === "runtime_command_ack" && state.failNextAck) {
        state.failNextAck = false;
        throw new Error("backplane acknowledgement failed");
      }
      if (
        kind === "runtime_command" &&
        state.failNextNonProbeAck &&
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        (payload as Record<string, unknown>).confirmOnly !== true
      ) {
        state.failNextNonProbeAck = false;
        state.failNextAck = true;
      }
      const envelope = {
        version: 1 as const,
        id: randomUUID(),
        kind,
        sourceReplicaId: here(),
        sentAt: Date.now(),
        payload,
      };
      const targets = registrations.filter(
        (entry) => entry.replica === targetReplicaId && entry.kind === kind,
      );
      for (const entry of targets) {
        await replicaContext.run(targetReplicaId, () => entry.handler(envelope));
      }
    },
    async broadcast() {},
  };

  /**
   * `register` writes Redis and only the registering replica's mirror —
   * modelling the dropped presence broadcast that leaves a peer permanently
   * blind to a live runtime, which is the production failure this suite exists
   * for.
   */
  const directory = {
    createDescriptor(input: Record<string, unknown>) {
      state.ownershipEpoch += 1;
      return {
        ...input,
        ownerReplicaId: here(),
        connectionGeneration: randomUUID(),
        ownershipEpoch: state.ownershipEpoch,
        lastHeartbeat: Date.now(),
        expiresAt: Date.now() + 120_000,
      } as Descriptor;
    },
    async register(descriptor: Descriptor) {
      redisStore.set(descriptor.key, descriptor);
      mirror().set(descriptor.key, descriptor);
      return descriptor;
    },
    registerLocal(descriptor: Descriptor) {
      redisStore.set(descriptor.key, descriptor);
      mirror().set(descriptor.key, descriptor);
      return descriptor;
    },
    async reclaim(descriptor: Descriptor) {
      const live = redisStore.get(descriptor.key);
      if (live && live.connectionGeneration !== descriptor.connectionGeneration) return null;
      redisStore.set(descriptor.key, descriptor);
      mirror().set(descriptor.key, descriptor);
      return descriptor;
    },
    async ownershipStatus(key: string, connectionGeneration: string, ownerReplicaId: string) {
      if (!state.redisReadable) return "unknown";
      const stored = redisStore.get(key);
      if (!stored || stored.expiresAt <= Date.now()) return "absent";
      return stored.connectionGeneration === connectionGeneration &&
        stored.ownerReplicaId === ownerReplicaId
        ? "owned"
        : "superseded";
    },
    get(key: string) {
      return mirror().get(key);
    },
    find(id: string, organizationId?: string | null) {
      return findIn(mirror(), id, organizationId);
    },
    async lookup(id: string, organizationId?: string | null, options?: { bypassCache?: boolean }) {
      if (!options?.bypassCache) {
        const cached = findIn(mirror(), id, organizationId);
        if (cached) return cached;
      }
      if (!state.redisReadable) throw new Error("redis unavailable");
      const stored = findIn(redisStore, id, organizationId);
      if (!stored) return undefined;
      mirror().set(stored.key, stored);
      return stored;
    },
    list() {
      return [...mirror().values()];
    },
    async renew() {
      return true;
    },
    onPresence() {
      return () => {};
    },
  };

  return { replicaContext, registrations, redisStore, mirrors, state, backplane, directory };
});

vi.mock("./realtime-backplane.js", async () => ({
  realtimeBackplane: (await harness).backplane,
}));

vi.mock("./runtime-directory.js", async () => ({
  runtimeDirectory: (await harness).directory,
}));

const { replicaContext, registrations, redisStore, mirrors, state } = await harness;
type Descriptor = { ownerReplicaId: string; connectionGeneration: string; ownershipEpoch: number };
const asReplica = <T>(replicaId: string, run: () => T): T => replicaContext.run(replicaId, run);

import type WebSocket from "ws";
import { SessionRouter, runtimeRouterKey } from "./session-router.js";

const ORG = "org-1";
const RUNTIME_ID = "runtime-1";
const RUNTIME_KEY = runtimeRouterKey(RUNTIME_ID, ORG);

function makeWs() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

function sentCommandTypes(ws: WebSocket): string[] {
  const send = ws.send as unknown as ReturnType<typeof vi.fn>;
  return send.mock.calls.map((call) => JSON.parse(String(call[0])).type as string);
}

/** Stand up replica A holding the runtime's socket, and a cold replica B. */
async function twoReplicas() {
  const ws = makeWs();
  const routerA = asReplica("replica-a", () => new SessionRouter());
  await asReplica("replica-a", () =>
    routerA.registerRuntime({
      key: RUNTIME_KEY,
      id: RUNTIME_ID,
      organizationId: ORG,
      label: "Cloud runtime",
      ws,
      hostingMode: "cloud",
      supportedTools: ["codex"],
      protocolVersion: 2,
    }),
  );
  const routerB = asReplica("replica-b", () => new SessionRouter());
  return { ws, routerA, routerB };
}

beforeEach(() => {
  registrations.length = 0;
  redisStore.clear();
  mirrors.clear();
  state.ownershipEpoch = 0;
  state.redisReadable = true;
  state.failNextNonProbeAck = false;
  state.failNextAck = false;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SessionRouter cross-replica delivery", () => {
  it("delivers a session command issued on the replica that does not hold the socket", async () => {
    const { ws, routerA, routerB } = await twoReplicas();

    // Replica B never saw the presence broadcast, so its mirror is empty. This
    // is the production state: `trace-backend` runs 2 replicas behind
    // `sessionAffinity: None`, so a user's send routinely lands here.
    expect(asReplica("replica-b", () => routerB.getRuntimeDescriptor(RUNTIME_ID, ORG))).toBe(
      undefined,
    );

    const result = await asReplica("replica-b", () =>
      routerB.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    // Regression: this returned an offline verdict, which persisted
    // `disconnected`, swapped the composer for the recovery panel, and offered
    // the user two actions that both rebuild a live workspace.
    expect(result).toBe("delivered");
    expect(sentCommandTypes(ws)).toEqual(["send"]);
    routerA.dispose();
    routerB.dispose();
  });

  it("delivers a direct runtime command across replicas with a cold mirror", async () => {
    const { ws, routerA, routerB } = await twoReplicas();

    // `sendToRuntimeAsync` read the mirror and nothing else, so terminal, app
    // and endpoint commands gave up on a live peer-owned runtime.
    const result = await asReplica("replica-b", () =>
      routerB.sendToRuntimeAsync(RUNTIME_ID, { type: "terminal_input", data: "ls\\n" }, ORG),
    );

    expect(result).toBe("delivered");
    expect(sentCommandTypes(ws)).toEqual(["terminal_input"]);
    routerA.dispose();
    routerB.dispose();
  });

  it("rejects a stale mirror owner and follows Redis to the current owner", async () => {
    const { ws, routerA, routerB } = await twoReplicas();
    const staleOwner = asReplica("replica-old", () => new SessionRouter());
    const current = redisStore.get(RUNTIME_KEY)!;
    mirrors.set(
      "replica-b",
      new Map([
        [
          RUNTIME_KEY,
          {
            ...current,
            ownerReplicaId: "replica-old",
            connectionGeneration: "generation-old",
            ownershipEpoch: current.ownershipEpoch - 1,
          },
        ],
      ]),
    );

    const result = await asReplica("replica-b", () =>
      routerB.sendToRuntimeAsync(RUNTIME_ID, { type: "terminal_input", data: "pwd\n" }, ORG),
    );

    expect(result).toBe("delivered");
    expect(sentCommandTypes(ws)).toEqual(["terminal_input"]);
    staleOwner.dispose();
    routerA.dispose();
    routerB.dispose();
  });

  it("defers when no routing record remains", async () => {
    const { routerA, routerB } = await twoReplicas();
    redisStore.clear();
    mirrors.clear();

    const result = await asReplica("replica-b", () =>
      routerB.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    expect(result).toBe("delivery_failed");
    routerA.dispose();
    routerB.dispose();
  });

  it("does not mistake a stale directory descriptor for a live remote socket", async () => {
    const { ws, routerA, routerB } = await twoReplicas();
    Object.assign(ws, { readyState: 3 });

    const result = await asReplica("replica-b", () =>
      routerB.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    expect(result).toBe("delivery_failed");
    expect(ws.send).not.toHaveBeenCalled();
    routerA.dispose();
    routerB.dispose();
  });

  it("never declares a cold-mirror peer offline while its live owner has a lapsed lease", async () => {
    const { ws, routerA, routerB } = await twoReplicas();
    redisStore.clear();
    mirrors.delete("replica-b");

    const peerResult = await asReplica("replica-b", () =>
      routerB.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    // B has no route, but only A owns the liveness fact. Treating this as
    // disconnected would rebuild the workspace behind A's still-open socket.
    expect(peerResult).toBe("delivery_failed");
    expect(ws.close).not.toHaveBeenCalled();
    expect(sentCommandTypes(ws)).toEqual([]);

    const ownerResult = await asReplica("replica-a", () =>
      routerA.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );
    expect(ownerResult).toBe("delivered");
    expect(sentCommandTypes(ws)).toEqual(["send"]);
    routerA.dispose();
    routerB.dispose();
  });

  it("defers instead of declaring a runtime gone when the directory is unreadable", async () => {
    const { routerA, routerB } = await twoReplicas();
    state.redisReadable = false;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await asReplica("replica-b", () =>
      routerB.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    // A Redis outage is not evidence of anything. `delivery_failed` is a retry;
    // `runtime_disconnected` would rebuild the workspace of a healthy container.
    expect(result).toBe("delivery_failed");
    routerA.dispose();
    routerB.dispose();
  });

  it("continues delivering after an acknowledgement failure", async () => {
    const { ws, routerA, routerB } = await twoReplicas();
    vi.stubEnv("TRACE_RUNTIME_COMMAND_TIMEOUT_MS", "20");
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.failNextNonProbeAck = true;

    const first = await asReplica("replica-b", () =>
      routerB.sendToRuntimeAsync(RUNTIME_ID, { type: "terminal_input", data: "first" }, ORG),
    );
    const second = await asReplica("replica-b", () =>
      routerB.sendToRuntimeAsync(RUNTIME_ID, { type: "terminal_input", data: "second" }, ORG),
    );

    expect(first).toBe("delivery_failed");
    expect(second).toBe("delivered");
    expect(sentCommandTypes(ws)).toEqual(["terminal_input", "terminal_input"]);
    routerA.dispose();
    routerB.dispose();
  });
});

describe("SessionRouter delivery on a lapsed directory lease", () => {
  it("keeps a live socket the owning replica still holds", async () => {
    const { ws, routerA } = await twoReplicas();
    // Only an owner writes its own key, so an expired lease is a lapse, never a
    // takeover. Reading it as one closed healthy bridges mid-stream.
    redisStore.clear();

    const result = await asReplica("replica-a", () =>
      routerA.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    expect(result).toBe("delivered");
    expect(ws.close).not.toHaveBeenCalled();
    expect(sentCommandTypes(ws)).toEqual(["send"]);
    routerA.dispose();
  });

  it("still disowns a socket a peer has genuinely taken over", async () => {
    const { ws, routerA } = await twoReplicas();
    const stolen = { ...(redisStore.get(RUNTIME_KEY) as Descriptor) };
    stolen.ownerReplicaId = "replica-b";
    stolen.connectionGeneration = "generation-peer";
    stolen.ownershipEpoch += 1;
    redisStore.set(RUNTIME_KEY, stolen);

    const result = await asReplica("replica-a", () =>
      routerA.sendAsync(
        "session-1",
        { type: "send", sessionId: "session-1", prompt: "continue" },
        { expectedHomeRuntimeId: RUNTIME_ID, organizationId: ORG },
      ),
    );

    // Not delivered locally, and the socket is fenced — the generation check
    // that #123/#159 added must survive the lapsed-lease relaxation.
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(1012, "Runtime ownership replaced");
    expect(result).toBe("delivery_failed");
    routerA.dispose();
  });
});
