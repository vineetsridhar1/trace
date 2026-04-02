/**
 * Action Executor — the only place where the agent runtime mutates product state.
 *
 * Takes a planned action (name + args), looks it up in the action registry,
 * and dispatches to the correct service method via the registry-driven dispatch map.
 * Never writes to the DB directly — everything flows through the service layer.
 */

import { findAction, getDispatcher, validateActionParams } from "./action-registry.js";
import type { ServiceContainer, AgentContext } from "./actions/types.js";
import { redis } from "../lib/redis.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedAction {
  actionType: string;
  args: Record<string, unknown>;
}

export interface ExecutionResult {
  status: "success" | "failed";
  actionType: string;
  result?: unknown;
  error?: string;
}

// Re-export for consumers
export type { ServiceContainer, AgentContext };

// ---------------------------------------------------------------------------
// Idempotency store
// ---------------------------------------------------------------------------

const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Pluggable idempotency store. The default in-memory implementation works for
 * single-process development. Swap for a Redis-backed implementation in
 * production (ticket #15 pipeline integration).
 */
export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  set(key: string): Promise<void>;
}

/**
 * In-memory idempotency store with TTL — suitable for development and tests.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private keys = new Map<string, number>();

  async has(key: string): Promise<boolean> {
    const ts = this.keys.get(key);
    if (ts === undefined) return false;
    if (Date.now() - ts > IDEMPOTENCY_TTL_MS) {
      this.keys.delete(key);
      return false;
    }
    return true;
  }

  async set(key: string): Promise<void> {
    this.keys.set(key, Date.now());

    // Lazy cleanup when the map gets large
    if (this.keys.size > 10_000) {
      const now = Date.now();
      for (const [k, ts] of this.keys) {
        if (now - ts > IDEMPOTENCY_TTL_MS) this.keys.delete(k);
      }
    }
  }
}

/**
 * Redis-backed idempotency store — survives worker restarts.
 * Keys are stored with automatic TTL expiry so no cleanup is needed.
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private prefix: string;

  constructor(prefix = "agent:idempotency") {
    this.prefix = prefix;
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await redis.exists(`${this.prefix}:${key}`);
      return exists === 1;
    } catch {
      // If Redis is unavailable, allow the action through rather than blocking
      return false;
    }
  }

  async set(key: string): Promise<void> {
    try {
      const ttlSeconds = Math.ceil(IDEMPOTENCY_TTL_MS / 1000);
      await redis.set(`${this.prefix}:${key}`, "1", "EX", ttlSeconds);
    } catch {
      // Non-fatal — worst case we might execute a duplicate on restart
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { createHash } from "crypto";

/** Cryptographic hash for idempotency key differentiation. */
function hashArgs(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export class ActionExecutor {
  private idempotency: IdempotencyStore;

  constructor(
    private services: ServiceContainer,
    idempotency?: IdempotencyStore,
  ) {
    this.idempotency = idempotency ?? new RedisIdempotencyStore();
  }

  async execute(action: PlannedAction, ctx: AgentContext): Promise<ExecutionResult> {
    const { actionType, args } = action;

    // ---- no_op: return immediately, no side effects ----
    if (actionType === "no_op") {
      return { status: "success", actionType };
    }

    // ---- Resolve from registry ----
    const registration = findAction(actionType);
    if (!registration) {
      return {
        status: "failed",
        actionType,
        error: `Unknown action: ${actionType}`,
      };
    }

    // ---- Validate parameters ----
    const validation = validateActionParams(registration, args);
    if (!validation.valid) {
      return {
        status: "failed",
        actionType,
        error: `Invalid parameters: ${validation.errors.join("; ")}`,
      };
    }

    // ---- Idempotency check ----
    // Include a hash of the args so that two different actions of the same type
    // on the same trigger event are not incorrectly deduplicated.
    const argsHash = hashArgs(JSON.stringify(args));
    const idempotencyKey = `agent:${ctx.agentId}:${actionType}:${ctx.triggerEventId}:${argsHash}`;
    if (await this.idempotency.has(idempotencyKey)) {
      return {
        status: "success",
        actionType,
        result: "duplicate — already executed for this trigger event",
      };
    }

    // ---- Execute via registry-driven dispatch ----
    try {
      const result = await this.dispatch(actionType, args, ctx);
      await this.idempotency.set(idempotencyKey);
      return { status: "success", actionType, result };
    } catch (err) {
      return {
        status: "failed",
        actionType,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatch — registry-driven lookup replaces the old switch statement
  // ---------------------------------------------------------------------------

  private async dispatch(
    actionName: string,
    args: Record<string, unknown>,
    ctx: AgentContext,
  ): Promise<unknown> {
    const dispatcher = getDispatcher(actionName);
    if (!dispatcher) {
      throw new Error(`No dispatcher for action: ${actionName}`);
    }
    return dispatcher(this.services, args, ctx);
  }
}
