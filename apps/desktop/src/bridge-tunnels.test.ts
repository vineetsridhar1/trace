import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestTunnelSlotConfig = {
  id: string;
  label: string;
  provider: "custom" | "ngrok";
  mode: "manual" | "trace_managed";
  publicUrl: string;
  targetPort: number | null;
  updatedAt: string;
};

class FakeReadable extends EventEmitter {
  emitLine(line: string): void {
    this.emit("data", Buffer.from(`${line}\n`, "utf-8"));
  }
}

class FakeChild extends EventEmitter {
  stdout = new FakeReadable();
  stderr = new FakeReadable();
  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit("exit", signal === "SIGTERM" || signal === "SIGKILL" ? 0 : null, signal ?? null);
    return true;
  });
}

const { spawnMock, saveBridgeTunnelSlotsMock, configState } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  saveBridgeTunnelSlotsMock: vi.fn(),
  configState: {
    slots: [] as TestTunnelSlotConfig[],
  },
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("./config.js", () => ({
  getBridgeTunnelSlots: () => configState.slots.map((slot) => ({ ...slot })),
  saveBridgeTunnelSlots: saveBridgeTunnelSlotsMock,
}));

vi.mock("./runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

import { BridgeTunnelManager } from "./bridge-tunnels.js";

function seedSlots(slots: TestTunnelSlotConfig[]): void {
  configState.slots = slots.map((slot) => ({ ...slot }));
}

describe("BridgeTunnelManager", () => {
  beforeEach(() => {
    vi.useRealTimers();
    spawnMock.mockReset();
    saveBridgeTunnelSlotsMock.mockReset();
    saveBridgeTunnelSlotsMock.mockImplementation(async (slots: TestTunnelSlotConfig[]) => {
      seedSlots(slots);
      return configState.slots;
    });
    seedSlots([
      {
        id: "slot-1",
        label: "Preview URL",
        provider: "ngrok",
        mode: "trace_managed",
        publicUrl: "https://preview.ngrok.app",
        targetPort: 3000,
        updatedAt: "2026-04-22T12:00:00.000Z",
      },
    ]);
  });

  it("waits for a ready log before marking a managed tunnel running", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const manager = new BridgeTunnelManager();

    const startPromise = manager.startSlot("slot-1");
    let settled = false;
    void startPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      "ngrok",
      [
        "http",
        "3000",
        "--url=https://preview.ngrok.app",
        "--log=stdout",
        "--log-format=json",
      ],
      expect.objectContaining({
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    expect(settled).toBe(false);
    expect(manager.getSlotsSnapshot()).toEqual([
      expect.objectContaining({
        id: "slot-1",
        state: "stopped",
        lastError: null,
      }),
    ]);

    child.stdout.emitLine('{"msg":"started tunnel","url":"https://preview.ngrok.app"}');

    await expect(startPromise).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        slot: expect.objectContaining({
          id: "slot-1",
          state: "running",
        }),
      }),
    );
  });

  it("fails startup when ngrok never reports readiness", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const manager = new BridgeTunnelManager();

    const startPromise = manager.startSlot("slot-1");

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(startPromise).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("did not report"),
        slot: expect.objectContaining({
          id: "slot-1",
          state: "error",
          lastError: expect.stringContaining("did not report"),
        }),
      }),
    );
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
