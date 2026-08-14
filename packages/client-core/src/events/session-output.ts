import { asJsonObject } from "@trace/shared";
import type { JsonObject } from "@trace/shared";
import type { AgentStatus, Event, EventType, ScopeType, SessionStatus } from "@trace/gql";
import { StoreBatchWriter, type SessionEntity, type SessionGroupEntity } from "../stores/entity.js";
import { mergeSessionGroupEntity } from "../lib/session-group.js";
import type { OrgEventUIBindings } from "./ui-bindings.js";

const CONNECTION_EVENT_TYPES = new Set([
  "connection_lost",
  "connection_restored",
  "recovery_failed",
  "recovery_requested",
  "session_rehomed",
]);

/** Extract session field updates from session_output subtypes. */
export function sessionPatchFromOutput(payload: JsonObject): Partial<SessionEntity> | undefined {
  if (payload.type === "workspace_ready" && typeof payload.workdir === "string") {
    return {
      ...(payload.agentStatus && { agentStatus: payload.agentStatus as AgentStatus }),
      ...(payload.sessionStatus && { sessionStatus: payload.sessionStatus as SessionStatus }),
      workdir: payload.workdir,
    };
  }
  if (payload.type === "workspace_failed") {
    const connection = asJsonObject(payload.connection);
    return {
      ...(payload.agentStatus && { agentStatus: payload.agentStatus as AgentStatus }),
      ...(payload.sessionStatus && { sessionStatus: payload.sessionStatus as SessionStatus }),
      ...(connection ? { connection: connection as SessionEntity["connection"] } : {}),
      worktreeDeleted: false,
    };
  }
  if (payload.type === "title_generated" && typeof payload.name === "string") {
    return { name: payload.name };
  }
  if (payload.type === "branch_renamed" && typeof payload.branch === "string") {
    return { branch: payload.branch };
  }
  if (payload.type === "config_changed") {
    const connection = asJsonObject(payload.connection);
    return {
      ...(typeof payload.tool === "string" ? { tool: payload.tool as SessionEntity["tool"] } : {}),
      ...(typeof payload.model === "string" || payload.model === null
        ? { model: payload.model }
        : {}),
      ...(typeof payload.reasoningEffort === "string" || payload.reasoningEffort === null
        ? { reasoningEffort: payload.reasoningEffort }
        : {}),
      ...(typeof payload.hosting === "string"
        ? { hosting: payload.hosting as SessionEntity["hosting"] }
        : {}),
      ...(connection ? { connection: connection as SessionEntity["connection"] } : {}),
    };
  }
  if (payload.type === "question_pending" || payload.type === "plan_pending") {
    return { sessionStatus: "needs_input" as SessionStatus };
  }
  if (payload.type === "usage_updated") {
    return {
      ...(typeof payload.inputTokens === "number" ? { inputTokens: payload.inputTokens } : {}),
      ...(typeof payload.outputTokens === "number" ? { outputTokens: payload.outputTokens } : {}),
      ...(typeof payload.cacheReadTokens === "number"
        ? { cacheReadTokens: payload.cacheReadTokens }
        : {}),
      ...(typeof payload.cacheCreationTokens === "number"
        ? { cacheCreationTokens: payload.cacheCreationTokens }
        : {}),
    };
  }
  if (typeof payload.type === "string" && CONNECTION_EVENT_TYPES.has(payload.type)) {
    const connection = asJsonObject(payload.connection);
    const sessionPatch: Partial<SessionEntity> = {
      ...(payload.agentStatus && { agentStatus: payload.agentStatus as AgentStatus }),
      ...(payload.sessionStatus && { sessionStatus: payload.sessionStatus as SessionStatus }),
    };
    if (connection) {
      sessionPatch.connection = connection as SessionEntity["connection"];
    }
    if (Object.keys(sessionPatch).length > 0) {
      return sessionPatch;
    }
  }
  return undefined;
}

export function shouldBumpSortTimestampForOutput(payload: JsonObject): boolean {
  return payload.type === "question_pending" || payload.type === "plan_pending";
}

export function patchGroupSessionsBranch(
  batch: StoreBatchWriter,
  sessionGroupId: string,
  branch: string,
): void {
  const allSessions = batch.getAll("sessions");
  for (const [sessionId, session] of Object.entries(allSessions)) {
    if (session.sessionGroupId === sessionGroupId) {
      batch.patch("sessions", sessionId, { branch } as Partial<SessionEntity>);
    }
  }
}

/** Extract a human-readable preview from a normalized message payload */
export function extractMessagePreview(eventType: EventType, payload: JsonObject): string | null {
  if (eventType === "message_sent") {
    return typeof payload.text === "string" ? payload.text : null;
  }

  if (payload.type !== "assistant") return null;

  const message = asJsonObject(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    const b = asJsonObject(block);
    if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
      return b.text;
    }
  }

  return null;
}

interface UpsertSessionGroupParams {
  batch: StoreBatchWriter;
  payload: JsonObject;
  timestamp: string;
  bumpSort?: boolean;
}

export function upsertSessionGroupFromPayload({
  batch,
  payload,
  timestamp,
  bumpSort = false,
}: UpsertSessionGroupParams): void {
  const sessionFromPayload = asJsonObject(payload.session);
  const sessionGroup =
    asJsonObject(payload.sessionGroup) ?? asJsonObject(sessionFromPayload?.sessionGroup);
  if (sessionGroup && typeof sessionGroup.id === "string") {
    const existing = batch.get("sessionGroups", sessionGroup.id);
    batch.upsert("sessionGroups", sessionGroup.id, {
      ...mergeSessionGroupEntity(existing, sessionGroup as SessionGroupEntity),
      ...(bumpSort ? { _sortTimestamp: timestamp } : {}),
    } as SessionGroupEntity);
  }
}

interface RouteSessionOutputParams {
  event: Event;
  payload: JsonObject;
  batch: StoreBatchWriter;
  ui: OrgEventUIBindings;
}

/**
 * Apply session_output subtype routing to the entity store batch.
 * Returns true if the event was a session_output (so the caller can
 * skip duplicate work).
 */
export function routeSessionOutput({ event, payload, batch, ui }: RouteSessionOutputParams): void {
  if (event.eventType !== "session_output" || event.scopeType !== ("session" satisfies ScopeType)) {
    return;
  }

  const bumpSort = shouldBumpSortTimestampForOutput(payload);
  upsertSessionGroupFromPayload({ batch, payload, timestamp: event.timestamp, bumpSort });

  const sessionPatch = sessionPatchFromOutput(payload);
  if (sessionPatch) {
    batch.patch("sessions", event.scopeId, {
      ...sessionPatch,
      updatedAt: event.timestamp,
      ...(bumpSort ? { _sortTimestamp: event.timestamp } : {}),
    });
  }

  if (payload.type === "branch_renamed" && typeof payload.branch === "string") {
    const sessionGroup = asJsonObject(payload.sessionGroup);
    const sessionGroupId =
      typeof sessionGroup?.id === "string"
        ? sessionGroup.id
        : (batch.get("sessions", event.scopeId)?.sessionGroupId ?? null);
    if (sessionGroupId) {
      patchGroupSessionsBranch(batch, sessionGroupId, payload.branch);
    }
  }

  if (payload.type === "session_rehomed" && typeof payload.newSessionId === "string") {
    if (ui.getActiveSessionId() === event.scopeId) {
      ui.setActiveSessionId(payload.newSessionId);
    }
  }
}
