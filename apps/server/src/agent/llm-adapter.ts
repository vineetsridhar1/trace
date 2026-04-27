/**
 * Shared LLM adapter singleton for the agent runtime.
 *
 * Both the planner and summary generator use this instead of maintaining
 * their own lazy singletons. Supports test injection.
 */

import type { LLMAdapter } from "@trace/shared";
import { createLLMAdapter } from "../lib/llm/index.js";
import { createAgentLogger, incrementMetric } from "./logger.js";

const logger = createAgentLogger("llm-adapter");

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let cachedAdapter: LLMAdapter | null = null;

export function getAgentLLMAdapter(): LLMAdapter {
  if (cachedAdapter) return cachedAdapter;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY env var is required for the agent runtime");
  }

  cachedAdapter = createLLMAdapter({ provider: "anthropic", apiKey });
  return cachedAdapter;
}

/** Inject a mock adapter for testing. Pass null to reset. */
export function setAgentLLMAdapterForTest(adapter: LLMAdapter | null): void {
  cachedAdapter = adapter;
}

// ---------------------------------------------------------------------------
// Retry wrapper with exponential backoff
// ---------------------------------------------------------------------------

/** HTTP status codes that are safe to retry (transient). */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

/** Errors that are safe to retry (transient). */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Prefer structured status code if available (Anthropic SDK errors expose .status)
  const status = (err as unknown as Record<string, unknown>).status;
  if (typeof status === "number" && RETRYABLE_STATUS_CODES.has(status)) return true;

  // Fallback to message matching for network-level errors
  const msg = err.message.toLowerCase();
  if (msg.includes("rate limit") || msg.includes("overloaded")) return true;
  if (msg.includes("econnreset") || msg.includes("econnrefused")) return true;
  if (msg.includes("etimedout") || msg.includes("socket hang up")) return true;
  if (msg.includes("fetch failed")) return true;

  return false;
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000). */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 15000). */
  maxDelayMs?: number;
  /** Jitter factor 0-1 to randomize delay (default: 0.2). */
  jitter?: number;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 15_000,
  jitter: 0.2,
};

/**
 * Execute an LLM call with exponential backoff retry on transient errors.
 * Non-retryable errors are thrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      incrementMetric("llmCallsTotal");
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= opts.maxRetries || !isRetryableError(err)) {
        incrementMetric("llmCallsFailed");
        throw err;
      }

      incrementMetric("llmRetriesTotal");

      const baseDelay = Math.min(opts.initialDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
      const jitter = baseDelay * opts.jitter * (Math.random() * 2 - 1);
      const delay = Math.max(0, Math.round(baseDelay + jitter));

      logger.log("retrying LLM call", {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}
