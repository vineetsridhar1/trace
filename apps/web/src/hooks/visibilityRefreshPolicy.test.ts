import { describe, expect, it } from "vitest";

import {
  canRestartAfterWake,
  getResumeAction,
  LAST_WAKE_RESTART_KEY,
  RESTART_COOLDOWN_MS,
  SLEEP_RESUME_THRESHOLD_MS,
} from "./visibilityRefreshPolicy";

function createStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem"> {
  return {
    getItem: (key: string) => (Object.hasOwn(initial, key) ? initial[key] : null),
  };
}

describe("visibility refresh policy", () => {
  it("does nothing for quick visibility changes", () => {
    expect(getResumeAction(1_000, false)).toBe("none");
  });

  it("soft-refreshes after routine backgrounding without restarting the client", () => {
    expect(getResumeAction(5 * 60 * 1_000, false)).toBe("refresh");
  });

  it("restarts only after a long sleep-like gap while disconnected", () => {
    expect(getResumeAction(SLEEP_RESUME_THRESHOLD_MS + 1, false)).toBe("refresh-and-restart");
    expect(getResumeAction(SLEEP_RESUME_THRESHOLD_MS + 1, true)).toBe("refresh");
  });

  it("enforces the wake restart cooldown", () => {
    const now = 1_000_000;

    expect(canRestartAfterWake(now, createStorage())).toBe(true);
    expect(
      canRestartAfterWake(
        now,
        createStorage({ [LAST_WAKE_RESTART_KEY]: String(now - RESTART_COOLDOWN_MS) }),
      ),
    ).toBe(false);
    expect(
      canRestartAfterWake(
        now,
        createStorage({ [LAST_WAKE_RESTART_KEY]: String(now - RESTART_COOLDOWN_MS - 1) }),
      ),
    ).toBe(true);
  });
});
