import { describe, expect, it } from "vitest";
import { isSessionPreparing, isSessionRuntimeStartingUp } from "../src/session/preparation.js";

describe("session preparation", () => {
  it("does not treat a new deferred runtime session as preparing before a message exists", () => {
    expect(
      isSessionPreparing({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        workdir: null,
        connection: { state: "pending" },
      }),
    ).toBe(false);
  });

  it("treats pending runtime selection as preparing once a message is queued", () => {
    expect(
      isSessionPreparing({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        workdir: null,
        lastUserMessageAt: "2026-05-14T12:00:00.000Z",
        connection: { state: "pending" },
      }),
    ).toBe(true);
  });

  it("treats active startup connection states as preparing", () => {
    expect(
      isSessionPreparing({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        workdir: null,
        connection: { state: "requested" },
      }),
    ).toBe(true);
  });

  it("does not gate input on the idle pending state", () => {
    expect(isSessionRuntimeStartingUp({ state: "pending" })).toBe(false);
    expect(isSessionRuntimeStartingUp({ state: "requested" })).toBe(true);
  });
});
