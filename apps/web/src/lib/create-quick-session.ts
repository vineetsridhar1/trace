import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, generateUUID, useEntityStore } from "@trace/client-core";
import {
  getCurrentNavigationState,
  navigateToSession,
  registerOptimisticSessionRedirect,
  replaceNavigationState,
} from "../stores/ui";
import {
  optimisticallyInsertSession,
  optimisticallyInsertSessionGroup,
  reconcileOptimisticSession,
  rollbackOptimisticSession,
} from "./optimistic-session";

const pendingQuickSessionChannels = new Set<string>();
const DEFAULT_DEFERRED_SESSION_TOOL = "claude_code";
const DEFAULT_DEFERRED_SESSION_HOSTING = "local";

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
 * Starts the session, then navigates once the service returns the real IDs.
 */
export async function createQuickSession(
  channelId: string,
  options: { visibility?: "public" | "private" } = {},
): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const channelRepoId = getChannelRepoId(channelId);
  const tempGroupId = `optimistic-group-${generateUUID()}`;
  const tempSessionId = `optimistic-session-${generateUUID()}`;
  const previousNavigation = getCurrentNavigationState();

  optimisticallyInsertSessionGroup({
    id: tempGroupId,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    optimistic: true,
  });
  optimisticallyInsertSession({
    id: tempSessionId,
    sessionGroupId: tempGroupId,
    tool: DEFAULT_DEFERRED_SESSION_TOOL,
    hosting: DEFAULT_DEFERRED_SESSION_HOSTING,
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
      replaceNavigationState(previousNavigation);
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      replaceNavigationState(previousNavigation);
      toast.error("Failed to create session", {
        description: "Server did not return a session ID",
      });
      return;
    }

    const realGroupId = session.sessionGroupId;
    if (!realGroupId) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      replaceNavigationState(previousNavigation);
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
      tool: DEFAULT_DEFERRED_SESSION_TOOL,
      hosting: DEFAULT_DEFERRED_SESSION_HOSTING,
      channelId,
      repoId: channelRepoId ?? null,
    });
    registerOptimisticSessionRedirect(tempGroupId, tempSessionId, {
      channelId,
      sessionGroupId: realGroupId,
      sessionId: session.id,
      page: "main",
      chatId: null,
      channelSubPage: null,
    });
    navigateToSession(channelId, realGroupId, session.id, { replace: true });
  } catch (err) {
    rollbackOptimisticSession(tempSessionId, tempGroupId);
    replaceNavigationState(previousNavigation);
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  } finally {
    pendingQuickSessionChannels.delete(channelId);
  }
}
