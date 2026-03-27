/**
 * Concurrency limiter for the agent pipeline.
 *
 * Prevents unbounded parallel pipeline executions when many aggregation
 * windows close simultaneously (e.g., after a burst of events).
 */

/**
 * Simple semaphore that limits concurrent async operations.
 * Unlike p-limit, this has zero dependencies.
 */
export class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  /**
   * Run an async function with concurrency limiting.
   * If the limit is reached, the call waits until a slot opens.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      // Don't decrement — the slot transfers to the next waiter
      next();
    } else {
      this.running--;
    }
  }

  /** Number of currently running operations. */
  get activeCount(): number {
    return this.running;
  }

  /** Number of operations waiting for a slot. */
  get pendingCount(): number {
    return this.queue.length;
  }
}
