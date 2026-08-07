export type ServerLifecycleState = "starting" | "ready" | "draining" | "stopped";

/**
 * Small, synchronous lifecycle state machine shared by HTTP readiness checks
 * and the shutdown path. Keeping this separate from index.ts makes the
 * readiness contract deterministic and directly testable.
 */
export class ServerLifecycle {
  private state: ServerLifecycleState = "starting";

  markReady(): void {
    if (this.state === "starting") this.state = "ready";
  }

  beginDrain(): boolean {
    if (this.state === "draining" || this.state === "stopped") return false;
    this.state = "draining";
    return true;
  }

  markStopped(): void {
    this.state = "stopped";
  }

  isReady(): boolean {
    return this.state === "ready";
  }

  isDraining(): boolean {
    return this.state === "draining" || this.state === "stopped";
  }

  snapshot(): { status: "ok" | "unavailable"; ready: boolean; state: ServerLifecycleState } {
    return {
      status: this.isReady() ? "ok" : "unavailable",
      ready: this.isReady(),
      state: this.state,
    };
  }
}
