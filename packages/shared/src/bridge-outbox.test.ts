import { describe, expect, it } from "vitest";
import { BridgeOutbox, isQueueableBridgeMessage } from "./bridge-outbox.js";
import type { BridgeMessage } from "./bridge.js";

describe("BridgeOutbox", () => {
  it("queues durable session messages and flushes them in order", () => {
    const outbox = new BridgeOutbox();
    const first: BridgeMessage = {
      type: "session_output",
      sessionId: "session-1",
      data: { type: "assistant" },
    };
    const second: BridgeMessage = { type: "session_complete", sessionId: "session-1" };
    const sent: BridgeMessage[] = [];

    expect(outbox.enqueue(first)).toBe(true);
    expect(outbox.enqueue(second)).toBe(true);
    expect(outbox.size).toBe(2);
    expect(outbox.flush((message) => {
      sent.push(message);
      return true;
    })).toBe(2);

    expect(sent).toEqual([first, second]);
    expect(outbox.size).toBe(0);
  });

  it("does not queue heartbeat or terminal noise", () => {
    const outbox = new BridgeOutbox();

    expect(
      outbox.enqueue({
        type: "runtime_heartbeat",
        instanceId: "runtime-1",
        activeSessionIds: ["session-1"],
      }),
    ).toBe(false);
    expect(outbox.enqueue({ type: "terminal_output", terminalId: "term-1", data: "hello" })).toBe(
      false,
    );
    expect(outbox.size).toBe(0);
  });

  it("stops flushing when the sender is unavailable", () => {
    const outbox = new BridgeOutbox();
    const first: BridgeMessage = { type: "session_complete", sessionId: "session-1" };
    const second: BridgeMessage = { type: "session_complete", sessionId: "session-2" };
    const sent: BridgeMessage[] = [];

    outbox.enqueue(first);
    outbox.enqueue(second);

    expect(outbox.flush((message) => {
      sent.push(message);
      return false;
    })).toBe(0);

    expect(sent).toEqual([first]);
    expect(outbox.size).toBe(2);
  });

  it("enforces the configured queue cap", () => {
    const outbox = new BridgeOutbox(1);

    expect(outbox.enqueue({ type: "session_complete", sessionId: "session-1" })).toBe(true);
    expect(outbox.enqueue({ type: "session_complete", sessionId: "session-2" })).toBe(false);
    expect(outbox.size).toBe(1);
  });

  it("shares the durable message policy with callers", () => {
    expect(isQueueableBridgeMessage({ type: "session_complete", sessionId: "session-1" })).toBe(
      true,
    );
    expect(isQueueableBridgeMessage({ type: "terminal_exit", terminalId: "term-1", exitCode: 0 }))
      .toBe(false);
  });
});
