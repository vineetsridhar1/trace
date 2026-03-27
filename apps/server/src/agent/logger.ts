/**
 * Shared structured logger for the agent runtime.
 *
 * All agent modules use this instead of ad-hoc console.log wrappers.
 * Produces JSON-structured output for machine parsing while remaining
 * human-readable in development.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentLogger {
  log: (msg: string, data?: Record<string, unknown>) => void;
  logError: (msg: string, err: unknown) => void;
  /** Create a child logger with additional prefix context. */
  child: (subPrefix: string) => AgentLogger;
}

export interface AgentMetrics {
  pipelineStarted: number;
  pipelineCompleted: number;
  pipelineFailed: number;
  llmCallsTotal: number;
  llmCallsFailed: number;
  llmRetriesTotal: number;
  eventsProcessed: number;
  eventsDropped: number;
  batchesClosed: number;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ---------------------------------------------------------------------------
// Metrics singleton
// ---------------------------------------------------------------------------

const metrics: AgentMetrics = {
  pipelineStarted: 0,
  pipelineCompleted: 0,
  pipelineFailed: 0,
  llmCallsTotal: 0,
  llmCallsFailed: 0,
  llmRetriesTotal: 0,
  eventsProcessed: 0,
  eventsDropped: 0,
  batchesClosed: 0,
  totalCostCents: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
};

export function getMetrics(): Readonly<AgentMetrics> {
  return { ...metrics };
}

export function incrementMetric(key: keyof AgentMetrics, amount = 1): void {
  metrics[key] += amount;
}

export function resetMetrics(): void {
  for (const key of Object.keys(metrics) as (keyof AgentMetrics)[]) {
    metrics[key] = 0;
  }
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Create a logger for an agent module.
 *
 * @param prefix - Module name, e.g. "agent-worker", "aggregator", "pipeline"
 */
export function createAgentLogger(prefix: string): AgentLogger {
  return {
    log(msg: string, data?: Record<string, unknown>): void {
      const tag = `[${prefix}]`;
      if (data) {
        console.log(tag, msg, JSON.stringify(data));
      } else {
        console.log(tag, msg);
      }
    },

    logError(msg: string, err: unknown): void {
      console.error(`[${prefix}] ${msg}:`, formatError(err));
    },

    child(subPrefix: string): AgentLogger {
      return createAgentLogger(`${prefix}:${subPrefix}`);
    },
  };
}

/**
 * Create a logger with elapsed-time tracking (for pipeline runs).
 */
export function createTimedLogger(prefix: string, startTime: number): AgentLogger {
  return {
    log(msg: string, data?: Record<string, unknown>): void {
      const elapsed = `+${Date.now() - startTime}ms`;
      const tag = `[${prefix}] [${elapsed}]`;
      if (data) {
        console.log(tag, msg, JSON.stringify(data));
      } else {
        console.log(tag, msg);
      }
    },

    logError(msg: string, err: unknown): void {
      const elapsed = `+${Date.now() - startTime}ms`;
      console.error(`[${prefix}] [${elapsed}] ${msg}:`, formatError(err));
    },

    child(subPrefix: string): AgentLogger {
      return createTimedLogger(`${prefix}:${subPrefix}`, startTime);
    },
  };
}
