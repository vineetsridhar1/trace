import type { SessionRuntimeInstance } from "@trace/gql";
import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, AVAILABLE_RUNTIMES_QUERY } from "./mutations";
import { optimisticallyInsertSession } from "./optimistic-session";
import { usePreferencesStore } from "../stores/preferences";
import { useEntityStore } from "../stores/entity";
import { useUIStore } from "../stores/ui";
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
 */
export async function createQuickSession(channelId: string): Promise<void> {
  // Open the panel immediately so the user sees instant feedback
  useUIStore.getState().setPendingSessionCreate({ channelId });

  try {
    const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
    const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);

    const channel = useEntityStore.getState().channels[channelId];
    const channelRepoId =
      channel && typeof channel === "object" && "repo" in channel && channel.repo &&
      typeof channel.repo === "object" && "id" in (channel.repo as Record<string, unknown>)
        ? (channel.repo as { id: string }).id
        : undefined;

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
      useUIStore.getState().setPendingSessionCreate(null);
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      useUIStore.getState().setPendingSessionCreate(null);
      return;
    }

    const sessionGroupId = session.sessionGroupId;
    if (sessionGroupId) {
      optimisticallyInsertSession({
        id: session.id,
        sessionGroupId,
        tool: prefTool,
        model: prefModel,
        hosting,
        channel: { id: channelId },
        repo: channelRepoId ? { id: channelRepoId } : null,
      });
      // Clear pending state and transition to the real session
      useUIStore.getState().setPendingSessionCreate(null);
      useUIStore.getState().openSessionTab(sessionGroupId, session.id);
      useUIStore.getState().setActiveSessionGroupId(sessionGroupId, session.id);
    } else {
      useUIStore.getState().setPendingSessionCreate(null);
    }
  } catch (err) {
    useUIStore.getState().setPendingSessionCreate(null);
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  }
}
