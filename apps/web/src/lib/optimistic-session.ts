import { useEntityStore } from "../stores/entity";
import type { SessionEntity } from "../stores/entity";

/**
 * Optimistically insert a new session into the entity store so that
 * tab navigation works immediately — before the `session_started`
 * event arrives via the org-wide subscription.
 *
 * The event stream will reconcile the entity with full server data
 * when it arrives.
 */
export function optimisticallyInsertSession(params: {
  id: string;
  name?: string | null;
  sessionGroupId: string;
  tool: string;
  model?: string | null;
  hosting: string;
  channel?: { id: string } | null;
  repo?: { id: string } | null;
  branch?: string | null;
}): void {
  const now = new Date().toISOString();
  useEntityStore.getState().upsert("sessions", params.id, {
    id: params.id,
    name: params.name ?? "New session",
    sessionGroupId: params.sessionGroupId,
    agentStatus: "not_started",
    sessionStatus: "in_progress",
    tool: params.tool,
    model: params.model ?? null,
    hosting: params.hosting,
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: params.branch ?? null,
    createdAt: now,
    updatedAt: now,
  } as Partial<SessionEntity> as SessionEntity);
}
