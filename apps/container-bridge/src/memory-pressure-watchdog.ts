import { readFileSync } from "node:fs";

const DEFAULT_CHECK_INTERVAL_MS = 1_000;
const DEFAULT_PRESSURE_THRESHOLD = 0.85;
const DEFAULT_RECOVERY_THRESHOLD = 0.7;
const MAX_MEANINGFUL_MEMORY_BYTES = 1024 ** 5;

type ReadTextFile = (path: string) => string;

export type CgroupMemorySnapshot = {
  currentBytes: number;
  maxBytes: number;
  utilization: number;
};

type MemoryPressureWatchdogOptions = {
  onPressure: (snapshot: CgroupMemorySnapshot) => void;
  onRecovery?: (snapshot: CgroupMemorySnapshot) => void;
  readTextFile?: ReadTextFile;
  checkIntervalMs?: number;
  pressureThreshold?: number;
  recoveryThreshold?: number;
};

const CGROUP_MEMORY_FILES = [
  {
    current: "/sys/fs/cgroup/memory.current",
    max: "/sys/fs/cgroup/memory.max",
  },
  {
    current: "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    max: "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  },
] as const;

function parseBytes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "max") return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function readCgroupMemorySnapshot(
  readTextFile: ReadTextFile = (path) => readFileSync(path, "utf8"),
): CgroupMemorySnapshot | null {
  for (const files of CGROUP_MEMORY_FILES) {
    try {
      const currentBytes = parseBytes(readTextFile(files.current));
      const maxBytes = parseBytes(readTextFile(files.max));
      if (
        currentBytes === null ||
        maxBytes === null ||
        maxBytes === 0 ||
        maxBytes >= MAX_MEANINGFUL_MEMORY_BYTES
      ) {
        continue;
      }
      return {
        currentBytes,
        maxBytes,
        utilization: currentBytes / maxBytes,
      };
    } catch {
      // Try the next cgroup layout. Local development hosts may expose neither.
    }
  }
  return null;
}

/**
 * Stops session workloads before the kernel OOM killer takes down the bridge.
 *
 * The pressure latch prevents repeated teardown while memory is being reclaimed.
 * It rearms only after utilization falls well below the pressure threshold.
 */
export class MemoryPressureWatchdog {
  private readonly readTextFile: ReadTextFile;
  private readonly checkIntervalMs: number;
  private readonly pressureThreshold: number;
  private readonly recoveryThreshold: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pressureLatched = false;

  constructor(private readonly options: MemoryPressureWatchdogOptions) {
    this.readTextFile = options.readTextFile ?? ((path) => readFileSync(path, "utf8"));
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.pressureThreshold = options.pressureThreshold ?? DEFAULT_PRESSURE_THRESHOLD;
    this.recoveryThreshold = options.recoveryThreshold ?? DEFAULT_RECOVERY_THRESHOLD;

    if (!Number.isFinite(this.checkIntervalMs) || this.checkIntervalMs < 100) {
      throw new Error("Memory pressure check interval must be at least 100ms");
    }
    if (
      !Number.isFinite(this.pressureThreshold) ||
      this.pressureThreshold <= 0 ||
      this.pressureThreshold >= 1
    ) {
      throw new Error("Memory pressure threshold must be between 0 and 1");
    }
    if (
      !Number.isFinite(this.recoveryThreshold) ||
      this.recoveryThreshold < 0 ||
      this.recoveryThreshold >= this.pressureThreshold
    ) {
      throw new Error("Memory recovery threshold must be below the pressure threshold");
    }
  }

  start(): void {
    if (this.timer) return;
    this.checkNow();
    this.timer = setInterval(() => this.checkNow(), this.checkIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  checkNow(): CgroupMemorySnapshot | null {
    const snapshot = readCgroupMemorySnapshot(this.readTextFile);
    if (!snapshot) return null;

    if (snapshot.utilization < this.recoveryThreshold && this.pressureLatched) {
      this.pressureLatched = false;
      this.options.onRecovery?.(snapshot);
    } else if (snapshot.utilization >= this.pressureThreshold && !this.pressureLatched) {
      this.pressureLatched = true;
      this.options.onPressure(snapshot);
    }
    return snapshot;
  }
}
