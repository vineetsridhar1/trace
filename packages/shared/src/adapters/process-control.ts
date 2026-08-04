import type { ChildProcess } from "child_process";

const DEFAULT_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const TERMINATION_GRACE_MS = 2_000;
const DEFAULT_CAPTURE_BYTES = 1024 * 1024;

export interface ProcessSupervisor {
  terminate(): void;
  clear(): void;
}

export class BoundedTextBuffer {
  private readonly chunks: string[] = [];
  private bytes = 0;
  private truncated = false;

  constructor(private readonly maxBytes = DEFAULT_CAPTURE_BYTES) {}

  get length(): number {
    return this.chunks.length;
  }

  append(value: string): void {
    if (this.truncated) return;
    const separatorBytes = this.chunks.length > 0 ? 1 : 0;
    const available = this.maxBytes - this.bytes - separatorBytes;
    if (available <= 0) {
      this.truncated = true;
      return;
    }
    const encoded = Buffer.from(value, "utf8");
    if (encoded.byteLength <= available) {
      this.chunks.push(value);
      this.bytes += encoded.byteLength + separatorBytes;
      return;
    }
    this.chunks.push(encoded.subarray(0, available).toString("utf8"));
    this.bytes = this.maxBytes;
    this.truncated = true;
  }

  toString(): string {
    const content = this.chunks.join("\n");
    return this.truncated ? `${content}\n[process output truncated by Trace]` : content;
  }
}

export function resolveRunTimeoutMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_RUN_TIMEOUT_MS;
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process already exited.
    }
  }
}

/**
 * Enforce a wall-clock deadline and terminate the whole spawned process tree.
 * SIGTERM is followed by SIGKILL so an uncooperative coding tool cannot stay
 * alive after the session has been aborted or timed out.
 */
export function superviseProcess(
  child: ChildProcess,
  options: { timeoutMs: number; onTimeout: () => void },
): ProcessSupervisor {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  let terminationRequested = false;

  const clear = () => {
    if (timeout) clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
    timeout = null;
    killTimer = null;
  };

  const terminate = () => {
    if (terminationRequested) return;
    terminationRequested = true;
    if (timeout) clearTimeout(timeout);
    timeout = null;
    signalProcessTree(child, "SIGTERM");
    killTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), TERMINATION_GRACE_MS);
    killTimer.unref?.();
  };

  timeout = setTimeout(() => {
    options.onTimeout();
    terminate();
  }, options.timeoutMs);
  timeout.unref?.();

  child.once("close", clear);
  child.once("error", clear);
  return { terminate, clear };
}
