import { describe, expect, it, vi } from "vitest";
import { WorkspacePreparationBarrier } from "./workspace-preparation.js";

describe("WorkspacePreparationBarrier", () => {
  it("holds a command until the active preparation completes", async () => {
    const tracker = new WorkspacePreparationBarrier();
    let finish!: () => void;
    const preparation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    tracker.track("session-1", preparation);

    const settled = vi.fn();
    void tracker.wait("session-1").then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    finish();
    await expect(tracker.wait("session-1")).resolves.toBe(true);
    expect(settled).toHaveBeenCalledWith(true);
  });

  it("refuses the command when preparation fails", async () => {
    const tracker = new WorkspacePreparationBarrier();
    const preparation = Promise.reject(new Error("clone failed"));
    tracker.track("session-1", preparation);

    await expect(tracker.wait("session-1")).resolves.toBe(false);
  });

  it("keeps waiting when a newer preparation supersedes the active one", async () => {
    const tracker = new WorkspacePreparationBarrier();
    let finishOld!: () => void;
    let finishNew!: () => void;
    const oldPreparation = new Promise<void>((resolve) => {
      finishOld = resolve;
    });
    const newPreparation = new Promise<void>((resolve) => {
      finishNew = resolve;
    });
    tracker.track("session-1", oldPreparation);
    let waiting = true;
    void tracker.wait("session-1").then(() => {
      waiting = false;
    });
    tracker.track("session-1", newPreparation);

    finishOld();
    await oldPreparation;
    await Promise.resolve();
    expect(waiting).toBe(true);

    finishNew();
    await expect(tracker.wait("session-1")).resolves.toBe(true);
  });
});
