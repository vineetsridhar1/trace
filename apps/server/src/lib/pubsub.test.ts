import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return {
    redis: createRedisMock(),
    redisSub: createRedisMock(),
  };
});

import { redis, redisSub } from "./redis.js";
import { pubsub, topics } from "./pubsub.js";

const redisMock = redis as any;
const redisSubMock = redisSub as any;

describe("pubsub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.publish.mockResolvedValue(undefined);
    redisSubMock.subscribe.mockResolvedValue(undefined);
    redisSubMock.unsubscribe.mockResolvedValue(undefined);
  });

  it("publishes serialized payloads to redis", () => {
    pubsub.publish("topic-1", { hello: "world" });

    expect(redisMock.publish).toHaveBeenCalledWith("topic-1", JSON.stringify({ hello: "world" }));
  });

  it("subscribes, delivers messages, and unsubscribes async iterators", async () => {
    pubsub.init();
    const handler = redisSubMock.on.mock.calls[0][1];
    const iterator = pubsub.asyncIterator<{ value: string }>("topic-1");

    expect(redisSubMock.subscribe).toHaveBeenCalledWith("topic-1");

    const next = iterator.next();
    handler("topic-1", JSON.stringify({ value: "hello" }));

    await expect(next).resolves.toEqual({ value: { value: "hello" }, done: false });
    await expect(iterator.return?.()).resolves.toEqual({ value: undefined, done: true });
    expect(redisSubMock.unsubscribe).toHaveBeenCalledWith("topic-1");
  });

  it("logs malformed payloads instead of throwing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    pubsub.init();
    const handler = redisSubMock.on.mock.calls[0][1];
    pubsub.asyncIterator("topic-2");

    handler("topic-2", "{bad json");

    expect(errorSpy).toHaveBeenCalled();
  });

  it("builds stable topic names", () => {
    expect(topics.channelEvents("c1")).toBe("channel:c1:events");
    expect(topics.orgEvents("o1")).toBe("org:o1:events");
    expect(topics.sessionPorts("s1")).toBe("session:s1:ports");
  });
});
