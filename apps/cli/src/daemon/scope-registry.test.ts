import { describe, expect, it, vi } from "vitest";
import { ScopeRegistry } from "./scope-registry.js";

function harness() {
  const closes: Array<ReturnType<typeof vi.fn>> = [];
  const open = vi.fn(() => {
    const close = vi.fn();
    closes.push(close);
    return close;
  });
  return { registry: new ScopeRegistry(open), open, closes };
}

describe("ScopeRegistry", () => {
  it("opens once and refcounts subscribers", () => {
    const { registry, open, closes } = harness();
    expect(registry.subscribe("session", "s1")).toBe(1);
    expect(registry.subscribe("session", "s1")).toBe(2);
    expect(open).toHaveBeenCalledTimes(1);

    // Two subscribes + one unsubscribe keeps the subscription alive.
    expect(registry.unsubscribe("session", "s1")).toBe(1);
    expect(closes[0]).not.toHaveBeenCalled();

    expect(registry.unsubscribe("session", "s1")).toBe(0);
    expect(closes[0]).toHaveBeenCalledTimes(1);
  });

  it("tracks scopes independently and reopens after close", () => {
    const { registry, open } = harness();
    registry.subscribe("session", "s1");
    registry.subscribe("channel", "c1");
    expect(open).toHaveBeenCalledTimes(2);

    registry.unsubscribe("session", "s1");
    registry.subscribe("session", "s1");
    expect(open).toHaveBeenCalledTimes(3);
  });

  it("ignores unsubscribes for unknown scopes", () => {
    const { registry } = harness();
    expect(registry.unsubscribe("session", "nope")).toBe(0);
  });

  it("disposeAll closes everything", () => {
    const { registry, closes } = harness();
    registry.subscribe("session", "s1");
    registry.subscribe("channel", "c1");
    registry.disposeAll();
    expect(closes.every((close) => close.mock.calls.length === 1)).toBe(true);
  });
});
