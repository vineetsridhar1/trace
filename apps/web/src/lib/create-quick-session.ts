import type { SessionRuntimeInstance } from "@trace/gql";
import { toast } from "sonner";
import { client } from "./urql";
import {
  START_SESSION_MUTATION,
  AVAILABLE_RUNTIMES_QUERY,
  useEntityStore,
} from "@trace/client-core";
import { usePreferencesStore } from "../stores/preferences";
import { navigateToSession } from "../stores/ui";
import { getDefaultModel } from "../components/session/modelOptions";
import { isLocalMode } from "./runtime-mode";

/**
 * Resolve the best runtime for a new session based on user preference.
 * Prefers a connected local bridge when defaultHosting is "bridge",
 * falls back to cloud if none available.
 */
async function resolveDefaultRuntime(
  tool: string,
  channelRepoId: string | undefined,
): Promise<{
  runtimeInstanceId: string | undefined;
  hosting: "cloud" | "local";
}> {
  const pref = usePreferencesStore.getState().defaultHosting;
  if (!isLocalMode && pref === "cloud") {
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
  return { runtimeInstanceId: undefined, hosting: isLocalMode ? "local" : "cloud" };
}

/**
 * Create a new not_started session with smart defaults.
 * Used by both Cmd+N and the + session button.
 *
 * Starts the session, then navigates once the service returns the real IDs.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
  const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);

  const channel = useEntityStore.getState().channels[channelId];
  const channelRepoId =
    channel &&
    typeof channel === "object" &&
    "repo" in channel &&
    channel.repo &&
    typeof channel.repo === "object" &&
    "id" in (channel.repo as Record<string, unknown>)
      ? (channel.repo as { id: string }).id
      : undefined;

  try {
    const { runtimeInstanceId, hosting } = await resolveDefaultRuntime(prefTool, channelRepoId);
    const isCloud = !isLocalMode && (!runtimeInstanceId || hosting === "cloud");
    if (isLocalMode && !runtimeInstanceId) {
      throw new Error("No connected local runtime available");
    }

    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: prefTool,
          model: prefModel ?? undefined,
          hosting: isCloud ? "cloud" : (isLocalMode ? "local" : undefined),
          runtimeInstanceId: isCloud ? undefined : runtimeInstanceId,
          channelId,
          repoId: channelRepoId ?? undefined,
        },
      })
      .toPromise();

    if (result.error) {
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      toast.error("Failed to create session", {
        description: "Server did not return a session ID",
      });
      return;
    }

    const realGroupId = session.sessionGroupId;
    if (!realGroupId) {
      toast.error("Failed to create session", {
        description: "Server did not return a session group ID",
      });
      return;
    }

    navigateToSession(channelId, realGroupId, session.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  }
}
