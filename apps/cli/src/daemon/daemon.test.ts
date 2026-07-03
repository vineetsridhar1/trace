import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AuthState, EntityState } from "@trace/client-core/headless";
import type { ClientRuntime, ConnectionState, CreateClientRuntimeOptions } from "../runtime.js";
import { runDaemon } from "./daemon.js";
import { PROTOCOL_VERSION, RPC_ERROR_CODES } from "./rpc.js";

interface Harness {
  send: (frame: unknown) => void;
  sendRaw: (raw: string) => void;
  endInput: () => void;
  frames: () => Promise<Array<Record<string, unknown>>>;
  nextFrame: () => Promise<Record<string, unknown>>;
  exits: number[];
  runtime: FakeRuntime | null;
  connection: (state: ConnectionState) => void;
}

class FakeRuntime implements ClientRuntime {
  disposed = false;
  startError: Error | null = null;
  slowStartMs = 0;

  readonly gql = {} as ClientRuntime["gql"];
  readonly stores = {
    entity: { getState: () => ({}) as EntityState, subscribe: () => () => {} },
    auth: {
      getState: () =>
        ({
          user: { id: "user-1", name: "Alex", email: "a@b.c" },
          activeOrgId: "org-1",
          orgMemberships: [
            {
              organizationId: "org-1",
              role: "admin",
              joinedAt: "2026-01-01T00:00:00.000Z",
              organization: { id: "org-1", name: "Test Org" },
            },
          ],
          loading: false,
          token: "tok",
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

function startHarness(overrides: { startError?: Error; slowStartMs?: number } = {}): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  const exits: number[] = [];
  let connectionCallback: ((state: ConnectionState) => void) | undefined;
  const harness: Harness = {
    send: (frame) => input.write(`${JSON.stringify(frame)}\n`),
    sendRaw: (raw) => input.write(raw),
    endInput: () => input.end(),
    exits,
    runtime: null,
    connection: (state) => connectionCallback?.(state),
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
  };

  void runDaemon({
    serverUrl: "http://localhost:4000",
    input,
    output,
    exit: (code) => exits.push(code),
    createRuntime: (options: CreateClientRuntimeOptions) => {
      const runtime = new FakeRuntime();
      if (overrides.startError) runtime.startError = overrides.startError;
      if (overrides.slowStartMs) runtime.slowStartMs = overrides.slowStartMs;
      connectionCallback = options.onConnectionChange;
      harness.runtime = runtime;
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
    expect(harness.runtime?.disposed).toBe(true);
  });

  it("rejects calls before initialize with NOT_INITIALIZED", async () => {
    const harness = startHarness();
    harness.send({ jsonrpc: "2.0", id: 5, method: "sessions/list" });
    expect(await harness.nextFrame()).toMatchObject({
      id: 5,
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

    // Split one frame across chunks, then join two frames in one chunk.
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
    harness.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 99 } });
    expect(await harness.nextFrame()).toMatchObject({
      id: 1,
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
    expect(harness.runtime?.disposed).toBe(true);
  });

  it("forwards connection state changes as notifications", async () => {
    const harness = startHarness();
    harness.send(init);
    await harness.frames();

    harness.connection("reconnecting");
    harness.connection("connected");
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
    expect(harness.runtime?.disposed).toBe(true);
  });
});
