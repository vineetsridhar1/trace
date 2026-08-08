import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isLocalMode: vi.fn(),
  set: vi.fn(),
  eval: vi.fn(),
}));

vi.mock("./mode.js", () => ({ isLocalMode: mocks.isLocalMode }));
vi.mock("./redis.js", () => ({
  redis: {
    set: mocks.set,
    eval: mocks.eval,
  },
}));

import { withDistributedLock } from "./distributed-lock.js";

describe("withDistributedLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eval.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("excludes concurrent local work and releases the key afterward", async () => {
    mocks.isLocalMode.mockReturnValue(true);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const first = withDistributedLock({ key: "runtime:group-1", ttlMs: 3_000 }, async () => {
      await gate;
      return "finished";
    });
    await vi.waitFor(async () => {
      expect(
        await withDistributedLock({ key: "runtime:group-1", ttlMs: 3_000 }, async () => "late"),
      ).toEqual({ acquired: false });
    });

    finish();
    await expect(first).resolves.toEqual({ acquired: true, value: "finished" });
    await expect(
      withDistributedLock({ key: "runtime:group-1", ttlMs: 3_000 }, async () => "next"),
    ).resolves.toEqual({ acquired: true, value: "next" });
  });

  it("fails fast when another replica owns the Redis lease", async () => {
    mocks.isLocalMode.mockReturnValue(false);
    mocks.set.mockResolvedValue(null);
    const run = vi.fn();

    await expect(
      withDistributedLock({ key: "runtime:group-1", ttlMs: 3_000 }, run),
    ).resolves.toEqual({ acquired: false });

    expect(mocks.set).toHaveBeenCalledWith(
      "runtime:group-1",
      expect.any(String),
      "PX",
      3_000,
      "NX",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("renews and ownership-checks release of a Redis lease", async () => {
    vi.useFakeTimers();
    mocks.isLocalMode.mockReturnValue(false);
    mocks.set.mockResolvedValue("OK");
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const result = withDistributedLock({ key: "runtime:group-1", ttlMs: 3_000 }, async () => {
      await gate;
      return "finished";
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("pexpire"),
      1,
      "runtime:group-1",
      expect.any(String),
      "3000",
    );

    finish();
    await expect(result).resolves.toEqual({ acquired: true, value: "finished" });
    expect(mocks.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("del"),
      1,
      "runtime:group-1",
      expect.any(String),
    );
  });
});
