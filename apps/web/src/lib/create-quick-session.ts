import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, generateUUID, useEntityStore } from "@trace/client-core";
import { usePreferencesStore } from "../stores/preferences";
import { navigateToSession } from "../stores/ui";
import { getDefaultModel } from "../components/session/modelOptions";
import {
  optimisticallyInsertSession,
  optimisticallyInsertSessionGroup,
  reconcileOptimisticSession,
  rollbackOptimisticSession,
} from "./optimistic-session";
import {
  beginActionLatency,
  expectActionEventLatency,
  markOptimisticLatency,
  measureMutationLatency,
} from "./action-latency";

const pendingQuickSessionChannels = new Set<string>();

export function getChannelRepoId(channelId: string): string | undefined {
  const channel = useEntityStore.getState().channels[channelId];
  return channel &&
    typeof channel === "object" &&
    "repo" in channel &&
    channel.repo &&
    typeof channel.repo === "object" &&
    "id" in (channel.repo as Record<string, unknown>) &&
    typeof (channel.repo as { id?: unknown }).id === "string"
    ? (channel.repo as { id: string }).id
    : undefined;
}

/**
 * Create a new not_started session and let the user choose the runtime later.
 * Used by both Cmd+N and the + session button.
 *
 * Inserts a temporary session immediately, then reconciles when the service
 * returns the canonical IDs.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
  const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);

  const channelRepoId = getChannelRepoId(channelId);
  const interactionId = beginActionLatency("start-session", { channelId });
  const tempSessionId = `optimistic:${generateUUID()}`;
  const tempGroupId = `optimistic:${generateUUID()}`;

  optimisticallyInsertSessionGroup({
    id: tempGroupId,
    name: "New session",
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    optimistic: true,
  });
  optimisticallyInsertSession({
    id: tempSessionId,
    name: "New session",
    sessionGroupId: tempGroupId,
    tool: prefTool,
    model: prefModel ?? null,
    reasoningEffort: null,
    hosting: "local",
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    branch: null,
    optimistic: true,
  });
  navigateToSession(channelId, tempGroupId, tempSessionId);
  markOptimisticLatency(interactionId);

  try {
    const result = await measureMutationLatency(
      interactionId,
      client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool: prefTool,
            model: prefModel ?? undefined,
            deferRuntimeSelection: true,
            channelId,
            repoId: channelRepoId ?? undefined,
          },
        })
        .toPromise(),
    );

    if (result.error) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      toast.error("Failed to create session", {
        description: "Server did not return a session ID",
      });
      return;
    }

    const realGroupId = session.sessionGroupId;
    if (!realGroupId) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      toast.error("Failed to create session", {
        description: "Server did not return a session group ID",
      });
      return;
    }

    expectActionEventLatency({
      interactionId,
      action: "start-session",
      scopeType: "session",
      scopeId: session.id,
      eventType: "session_started",
    });
    reconcileOptimisticSession({
      tempSessionId,
      tempGroupId,
      realSessionId: session.id,
      realGroupId,
      tool: prefTool,
      model: prefModel ?? null,
      reasoningEffort: null,
      hosting: "local",
      channelId,
      repoId: channelRepoId ?? null,
    });
    navigateToSession(channelId, realGroupId, session.id);
  } catch (err) {
    rollbackOptimisticSession(tempSessionId, tempGroupId);
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  } finally {
    pendingQuickSessionChannels.delete(channelId);
  }
}
