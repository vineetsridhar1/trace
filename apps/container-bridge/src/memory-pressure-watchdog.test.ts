import { describe, expect, it, vi } from "vitest";
import { MemoryPressureWatchdog, readCgroupMemorySnapshot } from "./memory-pressure-watchdog.js";

function cgroupReader(values: Record<string, string>): (path: string) => string {
  return (path) => {
    const value = values[path];
    if (value === undefined) throw new Error(`Missing ${path}`);
    return value;
  };
}

describe("readCgroupMemorySnapshot", () => {
  it("reads cgroup v2 usage and limit", () => {
    expect(
      readCgroupMemorySnapshot(
        cgroupReader({
          "/sys/fs/cgroup/memory.current": String(54 * 1024 ** 3),
          "/sys/fs/cgroup/memory.max": String(64 * 1024 ** 3),
        }),
      ),
    ).toEqual({
      currentBytes: 54 * 1024 ** 3,
      maxBytes: 64 * 1024 ** 3,
      utilization: 54 / 64,
    });
  });

  it("ignores hosts without a finite cgroup memory limit", () => {
    expect(
      readCgroupMemorySnapshot(
        cgroupReader({
          "/sys/fs/cgroup/memory.current": "1024",
          "/sys/fs/cgroup/memory.max": "max",
        }),
      ),
    ).toBeNull();
  });
});

describe("MemoryPressureWatchdog", () => {
  it("triggers once under pressure and rearms after memory recovers", () => {
    let currentBytes = 50;
    const onPressure = vi.fn();
    const onRecovery = vi.fn();
    const watchdog = new MemoryPressureWatchdog({
      onPressure,
      onRecovery,
      pressureThreshold: 0.85,
      recoveryThreshold: 0.7,
      readTextFile: (path) => {
        if (path.endsWith("memory.current")) return String(currentBytes);
        if (path.endsWith("memory.max")) return "100";
        throw new Error(`Unexpected path: ${path}`);
      },
    });

    watchdog.checkNow();
    currentBytes = 90;
    watchdog.checkNow();
    watchdog.checkNow();
    expect(onPressure).toHaveBeenCalledTimes(1);

    currentBytes = 60;
    watchdog.checkNow();
    expect(onRecovery).toHaveBeenCalledTimes(1);
    currentBytes = 90;
    watchdog.checkNow();
    expect(onPressure).toHaveBeenCalledTimes(2);
  });
});
