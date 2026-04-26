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

const pendingQuickSessionChannels = new Set<string>();

/**
 * Resolve the best connected local runtime for a new session.
 */
async function resolveDefaultRuntime(
  tool: string,
  channelRepoId: string | undefined,
): Promise<{
  runtimeInstanceId: string | undefined;
}> {
  try {
    const result = await client.query(AVAILABLE_RUNTIMES_QUERY, { tool }).toPromise();
    const runtimes = (result.data?.availableRuntimes ?? []) as SessionRuntimeInstance[];
    const connected = runtimes.filter((r) => r.connected && r.hostingMode === "local");
    const eligible = channelRepoId
      ? connected.filter((r) => r.registeredRepoIds.includes(channelRepoId))
      : connected;
    if (eligible.length > 0) {
      return { runtimeInstanceId: eligible[0].id };
    }
  } catch {
    // Fall through to the explicit missing-runtime error below.
  }
  return { runtimeInstanceId: undefined };
}

/**
 * Create a new not_started session with smart defaults.
 * Used by both Cmd+N and the + session button.
 *
 * Starts the session, then navigates once the service returns the real IDs.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

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
    const { runtimeInstanceId } = await resolveDefaultRuntime(prefTool, channelRepoId);
    if (!runtimeInstanceId) {
      throw new Error("No connected local runtime available");
    }

    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: prefTool,
          model: prefModel ?? undefined,
          hosting: "local",
          runtimeInstanceId,
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
  } finally {
    pendingQuickSessionChannels.delete(channelId);
  }
}
