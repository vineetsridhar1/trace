import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const instances: any[] = [];
  const RedisMock = vi.fn().mockImplementation((url: string, options: Record<string, unknown>) => {
    const client = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    instances.push({ url, options, client });
    return client;
  });

  return { instances, RedisMock };
});

vi.mock("ioredis", () => ({
  default: hoisted.RedisMock,
}));

import { connectRedis, disconnectRedis, redis, redisSub } from "./redis.js";

describe("redis client helpers", () => {
  it("creates named redis clients with lazy connect", async () => {
    expect(hoisted.instances).toHaveLength(2);
    expect(hoisted.instances[0].url).toBe(process.env.REDIS_URL);
    expect(hoisted.instances[0].options).toMatchObject({
      lazyConnect: true,
      connectionName: "main",
    });
    expect(hoisted.instances[1].options).toMatchObject({
      connectionName: "subscriber",
    });

    await connectRedis();

    expect(redis.connect).toHaveBeenCalled();
    expect(redisSub.connect).toHaveBeenCalled();
  });

  it("disconnects both clients", () => {
    disconnectRedis();

    expect(redis.disconnect).toHaveBeenCalled();
    expect(redisSub.disconnect).toHaveBeenCalled();
  });
});
