import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, useEntityStore } from "@trace/client-core";
import {
  getCurrentNavigationState,
  navigateToSession,
  replaceNavigationState,
  useUIStore,
} from "../stores/ui";
import {
  optimisticallyInsertSession,
  optimisticallyInsertSessionGroup,
  reconcileOptimisticSession,
  rollbackOptimisticSession,
} from "./optimistic-session";

const pendingQuickSessionChannels = new Set<string>();

function createTempId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

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
 * Optimistically opens the session, then swaps in the service-issued IDs.
 */
export async function createQuickSession(
  channelId: string,
  options: { visibility?: "public" | "private" } = {},
): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const channelRepoId = getChannelRepoId(channelId);
  const previousNavigation = getCurrentNavigationState();
  const tempGroupId = createTempId("temp_group");
  const tempSessionId = createTempId("temp_session");
  const optimisticTool = "claude_code";
  const optimisticHosting = "local";

  optimisticallyInsertSessionGroup({
    id: tempGroupId,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    optimistic: true,
  });
  optimisticallyInsertSession({
    id: tempSessionId,
    sessionGroupId: tempGroupId,
    tool: optimisticTool,
    hosting: optimisticHosting,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    optimistic: true,
  });
  navigateToSession(channelId, tempGroupId, tempSessionId);

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          deferRuntimeSelection: true,
          channelId,
          repoId: channelRepoId ?? undefined,
          visibility: options.visibility,
        },
      })
      .toPromise();

    if (result.error) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      restoreNavigationAfterRollback(tempGroupId, tempSessionId, previousNavigation);
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      restoreNavigationAfterRollback(tempGroupId, tempSessionId, previousNavigation);
      toast.error("Failed to create session", {
        description: "Server did not return a session ID",
      });
      return;
    }

    const realGroupId = session.sessionGroupId;
    if (!realGroupId) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      restoreNavigationAfterRollback(tempGroupId, tempSessionId, previousNavigation);
      toast.error("Failed to create session", {
        description: "Server did not return a session group ID",
      });
      return;
    }

    reconcileOptimisticSession({
      tempSessionId,
      tempGroupId,
      realSessionId: session.id,
      realGroupId,
      tool:
        typeof session.tool === "string" && session.tool.trim() ? session.tool : optimisticTool,
      model: typeof session.model === "string" ? session.model : null,
      reasoningEffort:
        typeof session.reasoningEffort === "string" ? session.reasoningEffort : null,
      hosting:
        typeof session.hosting === "string" && session.hosting.trim()
          ? session.hosting
          : optimisticHosting,
      channelId,
      repoId: channelRepoId ?? null,
    });

    if (isViewingOptimisticSession(tempGroupId, tempSessionId)) {
      navigateToSession(channelId, realGroupId, session.id, { replace: true });
    }
  } catch (err) {
    rollbackOptimisticSession(tempSessionId, tempGroupId);
    restoreNavigationAfterRollback(tempGroupId, tempSessionId, previousNavigation);
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  } finally {
    pendingQuickSessionChannels.delete(channelId);
  }
}

function isViewingOptimisticSession(tempGroupId: string, tempSessionId: string): boolean {
  const state = useUIStore.getState();
  return state.activeSessionGroupId === tempGroupId && state.activeSessionId === tempSessionId;
}

function restoreNavigationAfterRollback(
  tempGroupId: string,
  tempSessionId: string,
  previousNavigation: ReturnType<typeof getCurrentNavigationState>,
): void {
  if (!isViewingOptimisticSession(tempGroupId, tempSessionId)) return;
  replaceNavigationState(previousNavigation);
}
