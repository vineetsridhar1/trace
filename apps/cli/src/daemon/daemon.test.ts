import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore, type AuthState } from "@trace/client-core/headless";
import type { ClientRuntime, ConnectionState, CreateClientRuntimeOptions } from "../runtime.js";
import { runDaemon } from "./daemon.js";
import { PROTOCOL_VERSION, RPC_ERROR_CODES } from "./rpc.js";

function opName(doc: unknown): string {
  const definitions = (doc as { definitions?: Array<{ name?: { value?: string } }> }).definitions;
  return definitions?.[0]?.name?.value ?? "unknown";
}

interface FakeSubscription {
  op: string;
  variables: Record<string, unknown>;
  push: (data: Record<string, unknown>) => void;
  unsubscribed: boolean;
}

const ORG_FIXTURES: Record<string, { sessions: unknown[]; channels: unknown[] }> = {
  "org-1": {
    sessions: [
      {
        id: "sess-1",
        name: "Fix login",
        agentStatus: "done",
        sessionStatus: "needs_input",
        tool: "claude_code",
        model: null,
        branch: "fix/login",
        workdir: "/tmp/worktrees/fix-login",
        prUrl: null,
        worktreeDeleted: false,
        sessionGroupId: "group-1",
        lastMessageAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-03T10:00:00.000Z",
        repo: { id: "repo-1", name: "trace" },
        connection: { state: "connected", runtimeInstanceId: "rt-1", runtimeLabel: "MacBook" },
      },
    ],
    channels: [{ id: "chan-1", name: "general", type: "text", memberCount: 2, repo: null }],
  },
  "org-2": {
    sessions: [
      {
        id: "sess-9",
        name: "Other org session",
        agentStatus: "active",
        sessionStatus: "in_progress",
        tool: "codex",
        model: null,
        branch: null,
        workdir: null,
        prUrl: null,
        worktreeDeleted: false,
        sessionGroupId: null,
        lastMessageAt: null,
        updatedAt: "2026-07-01T00:00:00.000Z",
        repo: null,
        connection: null,
      },
    ],
    channels: [],
  },
};

interface HarnessState {
  activeOrgId: string;
  runtimes: FakeRuntime[];
  connection?: (state: ConnectionState) => void;
}

class FakeRuntime implements ClientRuntime {
  disposed = false;
  startError: Error | null = null;
  slowStartMs = 0;
  queryCount = 0;
  subscriptions: FakeSubscription[] = [];

  constructor(private readonly shared: HarnessState) {}

  readonly gql = {
    query: (doc: unknown) => {
      this.queryCount += 1;
      const fixtures = ORG_FIXTURES[this.shared.activeOrgId] ?? { sessions: [], channels: [] };
      const data: Record<string, unknown> = {
        HydrateChannels: { channels: fixtures.channels },
        HydrateSessions: { sessions: fixtures.sessions },
        HydrateTickets: { tickets: [] },
        HydrateRepos: { repos: [{ id: "repo-1", name: "trace" }] },
        SessionTimeline: {
          sessionTimeline: {
            hasOlder: true,
            items: [
              {
                kind: "event",
                event: {
                  id: "evt-old-2",
                  scopeType: "session",
                  scopeId: "sess-1",
                  eventType: "message_sent",
                  payload: { text: "older prompt" },
                  actor: { type: "user", id: "user-1", name: "Alex", avatarUrl: null },
                  parentId: null,
                  timestamp: "2026-07-02T09:00:01.000Z",
                  metadata: null,
                },
              },
              {
                kind: "event",
                event: {
                  id: "evt-old-1",
                  scopeType: "session",
                  scopeId: "sess-1",
                  eventType: "session_output",
                  payload: {
                    type: "assistant",
                    message: { content: [{ type: "text", text: "older answer" }] },
                  },
                  actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
                  parentId: null,
                  timestamp: "2026-07-02T09:00:02.000Z",
                  metadata: null,
                },
              },
            ],
          },
        },
      };
      return { toPromise: () => Promise.resolve({ data: data[opName(doc)] ?? {} }) };
    },
    mutation: (doc: unknown, variables: Record<string, unknown>) => {
      const op = opName(doc);
      const data: Record<string, unknown> = {
        SendSessionMessage: { sendSessionMessage: { id: "evt-ack" } },
        QueueSessionMessage: { queueSessionMessage: { id: "queued-ack" } },
        StartSession: { startSession: { id: "sess-new", sessionGroupId: "group-new" } },
        TerminateSession: { terminateSession: { id: variables.id } },
        SendChannelMessage: { sendChannelMessage: { id: "msg-ack" } },
        SendCodingChannelMessage: { sendMessage: { id: "evt-msg-ack" } },
      };
      return { toPromise: () => Promise.resolve({ data: data[op] }) };
    },
    subscription: (doc: unknown, variables: Record<string, unknown>) => ({
      subscribe: (callback: (result: { data?: unknown; error?: unknown }) => void) => {
        const entry: FakeSubscription = {
          op: opName(doc),
          variables,
          push: (data) => callback({ data }),
          unsubscribed: false,
        };
        this.subscriptions.push(entry);
        return {
          unsubscribe: () => {
            entry.unsubscribed = true;
          },
        };
      },
    }),
  } as unknown as ClientRuntime["gql"];

  readonly stores = {
    entity: { getState: useEntityStore.getState, subscribe: useEntityStore.subscribe },
    auth: {
      getState: () =>
        ({
          user: { id: "user-1", name: "Alex", email: "a@b.c" },
          activeOrgId: this.shared.activeOrgId,
          orgMemberships: [
            {
              organizationId: "org-1",
              role: "admin",
              joinedAt: "2026-01-01T00:00:00.000Z",
              organization: { id: "org-1", name: "Test Org" },
            },
            {
              organizationId: "org-2",
              role: "member",
              joinedAt: "2026-01-01T00:00:00.000Z",
              organization: { id: "org-2", name: "Org Two" },
            },
          ],
          loading: false,
          token: "tok",
          setActiveOrg: (orgId: string) => {
            this.shared.activeOrgId = orgId;
          },
        }) as unknown as AuthState,
      subscribe: () => () => {},
    },
  };

  start = vi.fn(async () => {
    if (this.slowStartMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.slowStartMs));
    }
    if (this.startError) throw this.startError;
  });

  dispose = vi.fn(async () => {
    this.disposed = true;
  });
}

interface Harness {
  send: (frame: unknown) => void;
  sendRaw: (raw: string) => void;
  endInput: () => void;
  frames: () => Promise<Array<Record<string, unknown>>>;
  nextFrame: () => Promise<Record<string, unknown>>;
  request: (id: number, method: string, params?: unknown) => Promise<Record<string, unknown>>;
  exits: number[];
  state: HarnessState;
  runtime: () => FakeRuntime;
}

function startHarness(overrides: { startError?: Error; slowStartMs?: number } = {}): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  const exits: number[] = [];
  const state: HarnessState = { activeOrgId: "org-1", runtimes: [] };

  const harness: Harness = {
    send: (frame) => input.write(`${JSON.stringify(frame)}\n`),
    sendRaw: (raw) => input.write(raw),
    endInput: () => input.end(),
    exits,
    state,
    runtime: () => {
      const runtime = state.runtimes.at(-1);
      if (!runtime) throw new Error("no runtime created yet");
      return runtime;
    },
    frames: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const raw = output.read() as Buffer | null;
      if (!raw) return [];
      return String(raw)
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    nextFrame: async () => {
      const all = await harness.frames();
      if (all.length === 0) throw new Error("no frame received");
      return all[0] as Record<string, unknown>;
    },
    request: async (id, method, params) => {
      harness.send({ jsonrpc: "2.0", id, method, params });
      const all = await harness.frames();
      const response = all.find((frame) => frame.id === id);
      if (!response) throw new Error(`no response for ${method}`);
      return response;
    },
  };

  void runDaemon({
    serverUrl: "http://localhost:4000",
    input,
    output,
    exit: (code) => exits.push(code),
    createRuntime: (options: CreateClientRuntimeOptions) => {
      const runtime = new FakeRuntime(state);
      if (overrides.startError) runtime.startError = overrides.startError;
      if (overrides.slowStartMs) runtime.slowStartMs = overrides.slowStartMs;
      state.connection = options.onConnectionChange;
      state.runtimes.push(runtime);
      return runtime;
    },
  });

  return harness;
}

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "test" } },
};

beforeEach(() => {
  useEntityStore.getState().reset();
});

describe("daemon rpc core", () => {
  it("round-trips initialize → shutdown", async () => {
    const harness = startHarness();
    harness.send(init);
    const initResponse = await harness.nextFrame();
    expect(initResponse).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        user: { id: "user-1", name: "Alex" },
        org: { id: "org-1", name: "Test Org" },
        connectionState: "disconnected",
      },
    });
    expect(typeof (initResponse.result as { cliVersion: unknown }).cliVersion).toBe("string");

    harness.send({ jsonrpc: "2.0", id: 2, method: "shutdown" });
    const shutdownFrames = await harness.frames();
    expect(shutdownFrames[0]).toMatchObject({ id: 2, result: null });
    expect(harness.exits).toEqual([0]);
    expect(harness.runtime().disposed).toBe(true);
  });

  it("rejects calls before initialize with NOT_INITIALIZED", async () => {
    const harness = startHarness();
    expect(await harness.request(5, "sessions/list")).toMatchObject({
      error: { code: RPC_ERROR_CODES.NOT_INITIALIZED },
    });
  });

  it("survives malformed and fragmented input", async () => {
    const harness = startHarness();
    harness.sendRaw("this is not json\n");
    expect(await harness.nextFrame()).toMatchObject({
      id: null,
      error: { code: RPC_ERROR_CODES.PARSE_ERROR },
    });

    const frame = JSON.stringify(init);
    harness.sendRaw(frame.slice(0, 20));
    harness.sendRaw(`${frame.slice(20)}\n`);
    const initResponse = await harness.nextFrame();
    expect(initResponse).toMatchObject({ id: 1 });
    expect(initResponse.error).toBeUndefined();

    harness.sendRaw(
      `${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "nope" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 8, method: "nope" })}\n`,
    );
    const frames = await harness.frames();
    expect(frames.map((f) => f.id)).toEqual([7, 8]);
    expect(frames[0]?.error).toMatchObject({ code: RPC_ERROR_CODES.METHOD_NOT_FOUND });
  });

  it("rejects protocol version mismatches with structured data", async () => {
    const harness = startHarness();
    expect(await harness.request(1, "initialize", { protocolVersion: 99 })).toMatchObject({
      error: {
        code: RPC_ERROR_CODES.VERSION_MISMATCH,
        data: { expected: PROTOCOL_VERSION, received: 99 },
      },
    });
  });

  it("maps runtime auth failures to UNAUTHENTICATED", async () => {
    const harness = startHarness({
      startError: new Error("Not authenticated. Run `trace login`."),
    });
    harness.send(init);
    expect(await harness.nextFrame()).toMatchObject({
      id: 1,
      error: { code: RPC_ERROR_CODES.UNAUTHENTICATED },
    });
    expect(harness.runtime().disposed).toBe(true);
  });

  it("forwards connection state changes as notifications", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();

    harness.state.connection?.("reconnecting");
    harness.state.connection?.("connected");
    const frames = await harness.frames();
    expect(frames).toEqual([
      { jsonrpc: "2.0", method: "connection/state", params: { state: "reconnecting" } },
      { jsonrpc: "2.0", method: "connection/state", params: { state: "connected" } },
    ]);
  });

  it("processes pipelined initialize → shutdown from a single chunk in order", async () => {
    const harness = startHarness({ slowStartMs: 50 });
    harness.sendRaw(
      `${JSON.stringify(init)}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown" })}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const frames = await harness.frames();
    expect(frames.map((frame) => frame.id)).toEqual([1, 2]);
    expect(frames[0]?.error).toBeUndefined();
    expect(frames[1]).toMatchObject({ id: 2, result: null });
    expect(harness.exits).toEqual([0]);
  });

  it("cleans up and exits on stdin EOF", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();

    harness.endInput();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(harness.exits).toEqual([0]);
    expect(harness.runtime().disposed).toBe(true);
  });
});

describe("snapshot, scope, and action methods", () => {
  it("hydrates on initialize and answers sessions/list from the store", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();
    expect(harness.runtime().queryCount).toBe(4);

    const response = await harness.request(2, "sessions/list");
    expect(response.result).toMatchObject({
      sessions: [
        {
          id: "sess-1",
          name: "Fix login",
          agentStatus: "done",
          sessionStatus: "needs_input",
          tool: "claude_code",
          repo: { id: "repo-1", name: "trace" },
          branch: "fix/login",
          workdir: "/tmp/worktrees/fix-login",
          runtimeLabel: "MacBook",
          connectionState: "connected",
        },
      ],
    });
    // Snapshots never trigger further round-trips.
    expect(harness.runtime().queryCount).toBe(4);

    const channels = await harness.request(3, "channels/list");
    expect(channels.result).toMatchObject({
      channels: [{ id: "chan-1", name: "general", type: "text", memberCount: 2 }],
    });
    const orgs = await harness.request(4, "orgs/list");
    expect(orgs.result).toMatchObject({
      orgs: [
        { id: "org-1", name: "Test Org", active: true },
        { id: "org-2", name: "Org Two", active: false },
      ],
    });
  });

  it("refcounts scope subscriptions over the wire", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();

    const scope = { scopeType: "session", scopeId: "sess-1" };
    expect((await harness.request(2, "scope/subscribe", scope)).result).toEqual({ count: 1 });
    expect((await harness.request(3, "scope/subscribe", scope)).result).toEqual({ count: 2 });

    const subs = harness.runtime().subscriptions.filter((s) => s.op === "SessionEventsLive");
    expect(subs).toHaveLength(1);
    expect(subs[0]?.variables).toEqual({ sessionId: "sess-1", organizationId: "org-1" });

    expect((await harness.request(4, "scope/unsubscribe", scope)).result).toEqual({ count: 1 });
    expect(subs[0]?.unsubscribed).toBe(false);
    expect((await harness.request(5, "scope/unsubscribe", scope)).result).toEqual({ count: 0 });
    expect(subs[0]?.unsubscribed).toBe(true);
  });

  it("acks actions immediately; the store only changes when events arrive", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();
    await harness.request(2, "scope/subscribe", { scopeType: "session", scopeId: "sess-1" });

    const ack = await harness.request(3, "session/prompt", {
      sessionId: "sess-1",
      text: "do the thing",
    });
    expect(ack.result).toEqual({ accepted: true, id: "evt-ack", queued: false });

    // Only the optimistic echo lands in the store — never the mutation result.
    const scopeKey = "session:sess-1";
    const afterAck = Object.keys(useEntityStore.getState().eventsByScope[scopeKey] ?? {});
    expect(afterAck).toHaveLength(1);
    expect(afterAck[0]).toMatch(/^optimistic:/);

    const subscription = harness.runtime().subscriptions.find((s) => s.op === "SessionEventsLive");
    subscription?.push({
      sessionEvents: {
        id: "evt-ack",
        scopeType: "session",
        scopeId: "sess-1",
        eventType: "message_sent",
        payload: { text: "do the thing" },
        actor: { type: "user", id: "user-1", name: "Alex", avatarUrl: null },
        parentId: null,
        timestamp: "2026-07-03T12:00:00.000Z",
        metadata: null,
      },
    });
    // The canonical event replaced the optimistic one — no duplicates.
    expect(Object.keys(useEntityStore.getState().eventsByScope[scopeKey] ?? {})).toEqual([
      "evt-ack",
    ]);

    const created = await harness.request(4, "session/create", { repoId: "repo-1" });
    expect(created.result).toEqual({
      accepted: true,
      id: "sess-new",
      sessionGroupId: "group-new",
    });
    const stopped = await harness.request(5, "session/stop", { sessionId: "sess-1" });
    expect(stopped.result).toEqual({ accepted: true, id: "sess-1" });
    const sent = await harness.request(6, "channel/send", {
      channelId: "chan-1",
      text: "hello",
    });
    expect(sent.result).toEqual({ accepted: true, id: "msg-ack" });
    expect(
      (await harness.request(7, "channel/send", { channelId: "nope", text: "x" })).error,
    ).toMatchObject({ code: RPC_ERROR_CODES.INVALID_PARAMS });
  });

  it("org/switch re-hydrates and snapshots reflect the new org", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();
    await harness.request(2, "scope/subscribe", { scopeType: "session", scopeId: "sess-1" });
    const firstRuntime = harness.runtime();

    const switched = await harness.request(3, "org/switch", { org: "Org Two" });
    expect(switched.result).toEqual({ org: { id: "org-2", name: "Org Two" } });
    expect(firstRuntime.disposed).toBe(true);
    expect(firstRuntime.subscriptions[0]?.unsubscribed).toBe(true);
    expect(harness.state.runtimes).toHaveLength(2);

    const sessions = await harness.request(4, "sessions/list");
    expect(sessions.result).toMatchObject({
      sessions: [{ id: "sess-9", name: "Other org session" }],
    });

    // Switching to the already-active org is a no-op.
    const same = await harness.request(5, "org/switch", { org: "org-2" });
    expect(same.result).toEqual({ org: { id: "org-2", name: "Org Two" } });
    expect(harness.state.runtimes).toHaveLength(2);
  });
});

describe("normalized deltas", () => {
  async function initializedHarness() {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();
    return harness;
  }

  function pushSessionEvent(
    harness: Harness,
    overrides: Partial<Record<string, unknown>> & { id: string },
  ) {
    const subscription = harness.runtime().subscriptions.find((s) => s.op === "SessionEventsLive");
    subscription?.push({
      sessionEvents: {
        scopeType: "session",
        scopeId: "sess-1",
        eventType: "message_sent",
        payload: { text: "hello" },
        actor: { type: "user", id: "user-1", name: "Alex", avatarUrl: null },
        parentId: null,
        timestamp: "2026-07-03T12:00:00.000Z",
        metadata: null,
        ...overrides,
      },
    });
  }

  it("streams session/nodes appends and reconciliation patches for subscribed scopes", async () => {
    const harness = await initializedHarness();
    await harness.request(2, "scope/subscribe", { scopeType: "session", scopeId: "sess-1" });

    // Live event → appended user_prompt node.
    pushSessionEvent(harness, { id: "evt-1", payload: { text: "first prompt" } });
    let frames = await harness.frames();
    const appendFrame = frames.find((f) => f.method === "session/nodes");
    expect(appendFrame?.params).toMatchObject({
      sessionId: "sess-1",
      appended: [{ id: "evt-1", kind: "user_prompt", text: "first prompt", optimistic: false }],
      patched: [],
      count: 1,
    });

    // Optimistic prompt → immediate append with optimistic:true (notification
    // lands in the same frame batch as the ack).
    harness.send({
      jsonrpc: "2.0",
      id: 3,
      method: "session/prompt",
      params: { sessionId: "sess-1", text: "do the thing" },
    });
    frames = await harness.frames();
    expect(frames.find((f) => f.id === 3)?.result).toMatchObject({
      accepted: true,
      queued: false,
    });
    const optimisticAppend = frames.find(
      (f) =>
        f.method === "session/nodes" &&
        (((f.params as Record<string, unknown>).appended as unknown[]) ?? []).length > 0,
    );
    expect(optimisticAppend?.params).toMatchObject({
      appended: [{ kind: "user_prompt", text: "do the thing", optimistic: true }],
      count: 2,
    });

    // Canonical event (the acked id) patches the optimistic node in place.
    pushSessionEvent(harness, { id: "evt-ack", payload: { text: "do the thing" } });
    frames = await harness.frames();
    const patchFrame = frames.find((f) => f.method === "session/nodes");
    expect(patchFrame?.params).toMatchObject({
      patched: [{ index: 1, node: { id: "evt-ack", optimistic: false } }],
      appended: [],
      count: 2,
    });
  });

  it("emits no session/nodes for unsubscribed scopes", async () => {
    const harness = await initializedHarness();
    await harness.request(2, "scope/subscribe", { scopeType: "session", scopeId: "sess-1" });
    await harness.request(3, "scope/unsubscribe", { scopeType: "session", scopeId: "sess-1" });

    pushSessionEvent(harness, { id: "evt-quiet" });
    const frames = await harness.frames();
    expect(frames.filter((f) => f.method === "session/nodes")).toEqual([]);
  });

  it("emits entity/upserted and badge/update when events change the store", async () => {
    const harness = await initializedHarness();
    // Simulate what an org event would do: flip the hydrated session out of needs_input.
    useEntityStore.getState().patch("sessions", "sess-1", { sessionStatus: "in_progress" });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const frames = await harness.frames();
    const upserted = frames.find((f) => f.method === "entity/upserted");
    expect(upserted?.params).toMatchObject({
      type: "sessions",
      entity: { id: "sess-1", sessionStatus: "in_progress" },
    });
    const badge = frames.find((f) => f.method === "badge/update");
    expect(badge?.params).toEqual({ needsInputCount: 0, mentionCount: 0 });
  });

  it("pages session/timeline backward without touching live state", async () => {
    const harness = await initializedHarness();
    const response = await harness.request(2, "session/timeline", {
      sessionId: "sess-1",
      beforeEventId: "evt-1",
      limit: 50,
    });
    expect(response.result).toMatchObject({
      sessionId: "sess-1",
      hasOlder: true,
      oldestEventId: "evt-old-2",
      nodes: [
        { id: "evt-old-2", kind: "user_prompt", text: "older prompt" },
        { id: "evt-old-1:0", kind: "agent_text", text: "older answer" },
      ],
    });
    expect(useEntityStore.getState().eventsByScope["session:sess-1"]).toBeUndefined();
  });
});
