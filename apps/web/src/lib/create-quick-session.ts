import type { SessionRuntimeInstance } from "@trace/gql";
import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, AVAILABLE_RUNTIMES_QUERY } from "./mutations";
import {
  optimisticallyInsertSession,
  optimisticallyInsertSessionGroup,
  reconcileOptimisticSession,
  rollbackOptimisticSession,
} from "./optimistic-session";
import { usePreferencesStore } from "../stores/preferences";
import { useEntityStore } from "../stores/entity";
import { useUIStore, navigateToSession } from "../stores/ui";
import { getDefaultModel } from "../components/session/modelOptions";

/**
 * Resolve the best runtime for a new session based on user preference.
 * Prefers a connected local bridge when defaultHosting is "bridge",
 * falls back to cloud if none available.
 */
async function resolveDefaultRuntime(tool: string, channelRepoId: string | undefined): Promise<{
  runtimeInstanceId: string | undefined;
  hosting: "cloud" | "local";
}> {
  const pref = usePreferencesStore.getState().defaultHosting;
  if (pref === "cloud") {
    return { runtimeInstanceId: undefined, hosting: "cloud" };
  }

  try {
    const result = await client.query(AVAILABLE_RUNTIMES_QUERY, { tool }).toPromise();
    const runtimes = (result.data?.availableRuntimes ?? []) as SessionRuntimeInstance[];
    const connected = runtimes.filter((r) => r.connected && r.hostingMode === "local");
    const eligible = channelRepoId
      ? connected.filter((r) => r.registeredRepoIds.includes(channelRepoId))
      : connected;
    if (eligible.length > 0) {
      return { runtimeInstanceId: eligible[0].id, hosting: "local" };
    }
  } catch {
    // Fall through to cloud
  }
  return { runtimeInstanceId: undefined, hosting: "cloud" };
}

/**
 * Create a new not_started session with smart defaults.
 * Used by both Cmd+N and the + session button.
 *
 * Navigates instantly with optimistic entities, then fires the mutation
 * in the background and reconciles when it resolves.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
  const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);
  const prefHosting = usePreferencesStore.getState().defaultHosting;

  const channel = useEntityStore.getState().channels[channelId];
  const channelRepoId =
    channel && typeof channel === "object" && "repo" in channel && channel.repo &&
    typeof channel.repo === "object" && "id" in (channel.repo as Record<string, unknown>)
      ? (channel.repo as { id: string }).id
      : undefined;

  // Generate temp IDs and navigate immediately
  const tempSessionId = crypto.randomUUID();
  const tempGroupId = crypto.randomUUID();
  const assumedHosting = prefHosting === "cloud" ? "cloud" : "local";

  optimisticallyInsertSessionGroup({
    id: tempGroupId,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
  });

  optimisticallyInsertSession({
    id: tempSessionId,
    sessionGroupId: tempGroupId,
    tool: prefTool,
    model: prefModel,
    hosting: assumedHosting,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
  });

  useUIStore.getState().openSessionTab(tempGroupId, tempSessionId);
  useUIStore.getState().setActiveSessionGroupId(tempGroupId, tempSessionId);

  // Fire mutation in background, reconcile when done
  try {
    const { runtimeInstanceId, hosting } = await resolveDefaultRuntime(prefTool, channelRepoId);
    const isCloud = !runtimeInstanceId || hosting === "cloud";

    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: prefTool,
          model: prefModel ?? undefined,
          hosting: isCloud ? "cloud" : undefined,
          runtimeInstanceId: isCloud ? undefined : runtimeInstanceId,
          channelId,
          repoId: channelRepoId ?? undefined,
        },
      })
      .toPromise();

    if (result.error) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      useUIStore.getState().closeSessionTab(tempGroupId, tempSessionId);
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      useUIStore.getState().closeSessionTab(tempGroupId, tempSessionId);
      return;
    }

    const realGroupId = session.sessionGroupId;
    if (!realGroupId) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      useUIStore.getState().closeSessionTab(tempGroupId, tempSessionId);
      return;
    }

    // Reconcile: swap temp entities for real ones
    useUIStore.getState().closeSessionTab(tempGroupId, tempSessionId);
    reconcileOptimisticSession({
      tempSessionId,
      tempGroupId,
      realSessionId: session.id,
      realGroupId,
      tool: prefTool,
      model: prefModel,
      hosting,
      channelId,
      repoId: channelRepoId,
    });

    // Navigate to real session (replaces temp URL)
    useUIStore.getState().openSessionTab(realGroupId, session.id);
    navigateToSession(channelId, realGroupId, session.id);
  } catch (err) {
    rollbackOptimisticSession(tempSessionId, tempGroupId);
    useUIStore.getState().closeSessionTab(tempGroupId, tempSessionId);
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  }
}
