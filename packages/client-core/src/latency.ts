import type { Event, EventType, ScopeType } from "@trace/gql";
import { asJsonObject } from "@trace/shared";

export type LatencyAction =
  | "send-session-message"
  | "queue-session-message"
  | "start-session"
  | "rename-session-group"
  | "archive-session-group"
  | "send-chat-message"
  | "send-channel-message"
  | "update-session-config";

export type LatencyPhase =
  | "submit"
  | "optimistic-store-write"
  | "mutation-request"
  | "mutation-response"
  | "subscription-event-received"
  | "event-handler-start"
  | "event-handler-store-flush"
  | "visible-ui-update"
  | "rollback";

export interface LatencySample {
  id: string;
  action: LatencyAction;
  phase: LatencyPhase;
  ms: number;
  at: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface LatencySummary {
  action: LatencyAction;
  count: number;
  optimisticP95Ms: number | null;
  canonicalP95Ms: number | null;
  visibleP95Ms: number | null;
}

interface Interaction {
  id: string;
  action: LatencyAction;
  startedAt: number;
  meta?: Record<string, string | number | boolean | null>;
}

interface ExpectedEvent {
  interactionId: string;
  action: LatencyAction;
  scopeType?: ScopeType;
  scopeId?: string;
  eventType?: EventType;
}

const RING_SIZE = 600;
const samples: LatencySample[] = [];
const interactions = new Map<string, Interaction>();
const clientMutationInteractions = new Map<string, string>();
const eventInteractions = new Map<string, string>();
const expectedEvents: ExpectedEvent[] = [];

export function beginLatencyInteraction(
  action: LatencyAction,
  meta?: Record<string, string | number | boolean | null>,
): string {
  const id = `${action}:${nowMs().toFixed(3)}:${Math.random().toString(36).slice(2, 8)}`;
  interactions.set(id, { id, action, startedAt: nowMs(), meta });
  recordLatencyMark(id, "submit", meta);
  return id;
}

export function registerLatencyClientMutation(
  clientMutationId: string | null | undefined,
  interactionId: string,
): void {
  if (!clientMutationId || !interactions.has(interactionId)) return;
  clientMutationInteractions.set(clientMutationId, interactionId);
}

export function expectLatencyEvent(input: ExpectedEvent): void {
  if (!interactions.has(input.interactionId)) return;
  expectedEvents.push(input);
}

export function recordLatencyMark(
  interactionId: string | null | undefined,
  phase: LatencyPhase,
  meta?: Record<string, string | number | boolean | null>,
): void {
  if (!interactionId) return;
  const interaction = interactions.get(interactionId);
  if (!interaction) return;

  const sample: LatencySample = {
    id: interactionId,
    action: interaction.action,
    phase,
    ms: nowMs() - interaction.startedAt,
    at: Date.now(),
    meta: { ...interaction.meta, ...meta },
  };
  samples.push(sample);
  if (samples.length > RING_SIZE) samples.shift();

  if (isDevLoggingEnabled()) {
    console.debug(
      `[latency] ${interaction.action} ${phase}: ${sample.ms.toFixed(1)}ms`,
      sample.meta ?? {},
    );
  }
}

export function findLatencyInteractionForEvent(event: Event): string | null {
  const payload = asJsonObject(event.payload);
  const clientMutationId =
    typeof payload?.clientMutationId === "string" ? payload.clientMutationId : null;
  if (clientMutationId) {
    const interactionId = clientMutationInteractions.get(clientMutationId);
    if (interactionId) {
      eventInteractions.set(event.id, interactionId);
      return interactionId;
    }
  }

  const existing = eventInteractions.get(event.id);
  if (existing) return existing;

  const idx = expectedEvents.findIndex(
    (expected) =>
      (!expected.scopeType || expected.scopeType === event.scopeType) &&
      (!expected.scopeId || expected.scopeId === event.scopeId) &&
      (!expected.eventType || expected.eventType === event.eventType),
  );
  if (idx === -1) return null;

  const [expected] = expectedEvents.splice(idx, 1);
  eventInteractions.set(event.id, expected.interactionId);
  return expected.interactionId;
}

export function markLatencyEventReceived(event: Event, source: "org" | "session" | "chat" | "channel"): void {
  const interactionId = findLatencyInteractionForEvent(event);
  if (!interactionId) return;
  recordLatencyMark(interactionId, "subscription-event-received", {
    source,
    eventType: event.eventType,
  });
}

export function markLatencyEventHandled(event: Event, durationMs: number): void {
  const interactionId = findLatencyInteractionForEvent(event);
  if (!interactionId) return;
  recordLatencyMark(interactionId, "event-handler-store-flush", {
    eventType: event.eventType,
    handlerMs: Number(durationMs.toFixed(2)),
  });
  scheduleVisibleMark(interactionId);
}

export function scheduleVisibleMark(interactionId: string): void {
  const callback = () => recordLatencyMark(interactionId, "visible-ui-update");
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(callback));
    return;
  }
  setTimeout(callback, 0);
}

export function recentLatencySamples(action?: LatencyAction): LatencySample[] {
  return action ? samples.filter((sample) => sample.action === action) : samples.slice();
}

export function clearLatencySamples(): void {
  samples.length = 0;
  interactions.clear();
  clientMutationInteractions.clear();
  eventInteractions.clear();
  expectedEvents.length = 0;
}

export function summarizeLatencySamples(input: LatencySample[] = samples): LatencySummary[] {
  const actions = new Map<LatencyAction, LatencySample[]>();
  for (const sample of input) {
    const bucket = actions.get(sample.action);
    if (bucket) bucket.push(sample);
    else actions.set(sample.action, [sample]);
  }

  return [...actions.entries()].map(([action, bucket]) => ({
    action,
    count: new Set(bucket.map((sample) => sample.id)).size,
    optimisticP95Ms: percentile(
      bucket.filter((sample) => sample.phase === "optimistic-store-write").map((sample) => sample.ms),
      95,
    ),
    canonicalP95Ms: percentile(
      bucket
        .filter((sample) => sample.phase === "event-handler-store-flush")
        .map((sample) => sample.ms),
      95,
    ),
    visibleP95Ms: percentile(
      bucket.filter((sample) => sample.phase === "visible-ui-update").map((sample) => sample.ms),
      95,
    ),
  }));
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(1));
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isDevLoggingEnabled(): boolean {
  const globalWithTrace = globalThis as {
    __TRACE_LATENCY_DEBUG__?: boolean;
  };
  return globalWithTrace.__TRACE_LATENCY_DEBUG__ === true;
}
