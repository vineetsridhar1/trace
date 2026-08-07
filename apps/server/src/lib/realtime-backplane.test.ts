import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(async () => 1),
  channels: new Map<string, Set<(value: unknown) => void>>(),
}));

vi.mock("./redis.js", () => ({
  redis: { publish: mocks.publish },
}));
vi.mock("./pubsub.js", () => ({
  pubsub: {
    waitForSubscription: vi.fn(async () => {}),
    asyncIterator: (topic: string) => {
      const values: unknown[] = [];
      const resolvers: Array<(value: IteratorResult<unknown>) => void> = [];
      let done = false;
      const handler = (value: unknown) => {
        const resolve = resolvers.shift();
        if (resolve) resolve({ value, done: false });
        else values.push(value);
      };
      const handlers = mocks.channels.get(topic) ?? new Set();
      handlers.add(handler);
      mocks.channels.set(topic, handlers);
      return {
        next: async () => {
          if (done) return { value: undefined, done: true };
          if (values.length > 0) return { value: values.shift(), done: false };
          return new Promise<IteratorResult<unknown>>((resolve) => resolvers.push(resolve));
        },
        return: async () => {
          done = true;
          handlers.delete(handler);
          for (const resolve of resolvers) resolve({ value: undefined, done: true });
          return { value: undefined, done: true };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  },
}));
vi.mock("./mode.js", () => ({
  isLocalMode: () => false,
}));

describe("RealtimeBackplane", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.publish.mockClear();
    mocks.channels.clear();
    mocks.publish.mockImplementation(async (topic: string, message: string) => {
      const value = JSON.parse(message) as unknown;
      for (const handler of mocks.channels.get(topic) ?? []) handler(value);
      return 1;
    });
    process.env.TRACE_REALTIME_BACKPLANE_ENABLED = "true";
    process.env.TRACE_REPLICA_ID = "replica-a";
  });

  it("publishes versioned envelopes to a target replica inbox", async () => {
    const { RealtimeBackplane } = await import("./realtime-backplane.js");
    const backplane = new RealtimeBackplane();

    await backplane.send("replica-b", "runtime_command", { command: "ping" });

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.publish.mock.calls[0]?.[0]).toBe("trace:replica:v1:replica-b");
    expect(JSON.parse(String(mocks.publish.mock.calls[0]?.[1]))).toMatchObject({
      version: 1,
      kind: "runtime_command",
      sourceReplicaId: "replica-a",
      payload: { command: "ping" },
    });
  });

  it("chunks payloads larger than the transport frame budget", async () => {
    const { RealtimeBackplane } = await import("./realtime-backplane.js");
    const backplane = new RealtimeBackplane();

    await backplane.send("replica-b", "bridge_correlated_response", {
      bodyBase64: "x".repeat(700_000),
    });

    expect(mocks.publish.mock.calls.length).toBeGreaterThan(2);
    for (const call of mocks.publish.mock.calls) {
      const envelope = JSON.parse(String(call[1]));
      expect(envelope.kind).toBe("__backplane_chunk");
      expect(Buffer.byteLength(String(call[1]))).toBeLessThanOrEqual(256 * 1024);
    }
  });

  it("dispatches self-addressed messages without Redis", async () => {
    const { RealtimeBackplane } = await import("./realtime-backplane.js");
    const backplane = new RealtimeBackplane();
    const handler = vi.fn();
    backplane.on("ping", handler);

    await backplane.send("replica-a", "ping", { ok: true });

    expect(handler).toHaveBeenCalledOnce();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("delivers between two replica inboxes", async () => {
    const { RealtimeBackplane } = await import("./realtime-backplane.js");
    process.env.TRACE_REPLICA_ID = "replica-a";
    const replicaA = new RealtimeBackplane();
    process.env.TRACE_REPLICA_ID = "replica-b";
    const replicaB = new RealtimeBackplane();
    const received = vi.fn();
    replicaB.on("command", received);
    await Promise.all([replicaA.start(), replicaB.start()]);

    await replicaA.send("replica-b", "command", { sequence: 1 });
    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());

    expect(received.mock.calls[0]?.[0]).toMatchObject({
      sourceReplicaId: "replica-a",
      payload: { sequence: 1 },
    });
    await Promise.all([replicaA.stop(), replicaB.stop()]);
  });
});
