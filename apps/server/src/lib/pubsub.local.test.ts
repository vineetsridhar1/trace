import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return {
    redis: createRedisMock(),
    redisSub: createRedisMock(),
  };
});

describe("pubsub in local mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TRACE_LOCAL_MODE", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("delivers published payloads without Redis", async () => {
    const { pubsub } = await import("./pubsub.js");
    const iterator = pubsub.asyncIterator<{ value: string }>("topic-1");

    pubsub.publish("topic-1", { value: "hello" });

    await expect(iterator.next()).resolves.toEqual({
      value: { value: "hello" },
      done: false,
    });
    await expect(iterator.return?.()).resolves.toEqual({ value: undefined, done: true });
  });
});
