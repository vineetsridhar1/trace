import {
  beginLatencyInteraction,
  expectLatencyEvent,
  recentLatencySamples,
  recordLatencyMark,
  registerLatencyClientMutation,
  scheduleVisibleMark,
  summarizeLatencySamples,
  type LatencyAction,
} from "@trace/client-core";
import type { EventType, ScopeType } from "@trace/gql";

export function beginActionLatency(
  action: LatencyAction,
  meta?: Record<string, string | number | boolean | null>,
): string {
  return beginLatencyInteraction(action, meta);
}

export function markOptimisticLatency(interactionId: string): void {
  recordLatencyMark(interactionId, "optimistic-store-write");
  scheduleVisibleMark(interactionId);
}

export async function measureMutationLatency<T>(
  interactionId: string,
  mutation: Promise<T>,
): Promise<T> {
  recordLatencyMark(interactionId, "mutation-request");
  try {
    const result = await mutation;
    recordLatencyMark(interactionId, "mutation-response");
    return result;
  } catch (error) {
    recordLatencyMark(interactionId, "mutation-response", { error: true });
    throw error;
  }
}

export function connectClientMutationLatency(
  clientMutationId: string | null | undefined,
  interactionId: string,
): void {
  registerLatencyClientMutation(clientMutationId, interactionId);
}

export function expectActionEventLatency(input: {
  interactionId: string;
  action: LatencyAction;
  scopeType?: ScopeType;
  scopeId?: string;
  eventType?: EventType;
}): void {
  expectLatencyEvent(input);
}

const globalWithLatency = globalThis as {
  __TRACE_LATENCY__?: {
    recent: typeof recentLatencySamples;
    summary: typeof summarizeLatencySamples;
  };
};

globalWithLatency.__TRACE_LATENCY__ = {
  recent: recentLatencySamples,
  summary: summarizeLatencySamples,
};
