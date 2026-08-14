import { describe, expect, it } from "vitest";
import { ServerLifecycle } from "./server-lifecycle.js";

describe("ServerLifecycle", () => {
  it("is unavailable until startup completes", () => {
    const lifecycle = new ServerLifecycle();
    expect(lifecycle.snapshot()).toEqual({
      status: "unavailable",
      ready: false,
      state: "starting",
    });
  });

  it("becomes unavailable before an idempotent drain", () => {
    const lifecycle = new ServerLifecycle();
    lifecycle.markReady();
    expect(lifecycle.isReady()).toBe(true);

    expect(lifecycle.beginDrain()).toBe(true);
    expect(lifecycle.beginDrain()).toBe(false);
    expect(lifecycle.snapshot()).toEqual({
      status: "unavailable",
      ready: false,
      state: "draining",
    });
  });

  it("cannot become ready again after draining", () => {
    const lifecycle = new ServerLifecycle();
    lifecycle.beginDrain();
    lifecycle.markReady();
    lifecycle.markStopped();

    expect(lifecycle.isReady()).toBe(false);
    expect(lifecycle.isDraining()).toBe(true);
    expect(lifecycle.snapshot().state).toBe("stopped");
  });
});
