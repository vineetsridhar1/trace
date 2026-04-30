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

type RuntimeUnavailableReason = "no_local_runtime" | "repo_not_linked";

interface AvailableRuntimesQueryResult {
  availableRuntimes?: SessionRuntimeInstance[];
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

export function quickSessionUnavailableMessage(reason?: RuntimeUnavailableReason): string {
  if (reason === "repo_not_linked") {
    return "Link this repo on your desktop first.";
  }
  return "No connected local runtime available.";
}

/**
 * Resolve the best connected local runtime for a new session.
 */
async function resolveDefaultRuntime(
  tool: string,
  channelRepoId: string | undefined,
): Promise<{
  runtimeInstanceId: string | undefined;
  unavailableReason?: RuntimeUnavailableReason;
}> {
  try {
    const result = await client
      .query<AvailableRuntimesQueryResult>(AVAILABLE_RUNTIMES_QUERY, { tool })
      .toPromise();
    const runtimes = result.data?.availableRuntimes ?? [];
    const connected = runtimes.filter((r) => r.connected && r.hostingMode === "local");
    const eligible = channelRepoId
      ? connected.filter((r) => r.registeredRepoIds.includes(channelRepoId))
      : connected;
    if (eligible.length > 0) {
      return { runtimeInstanceId: eligible[0].id };
    }
    return {
      runtimeInstanceId: undefined,
      unavailableReason:
        channelRepoId && connected.length > 0 ? "repo_not_linked" : "no_local_runtime",
    };
  } catch {
    // Fall through to the explicit missing-runtime error below.
  }
  return { runtimeInstanceId: undefined, unavailableReason: "no_local_runtime" };
}

/**
 * Create a new not_started session with smart defaults.
 * Used by both Cmd+N and the + session button.
 *
 * Starts the session, then navigates once the service returns the real IDs.
 */
export async function createQuickSession(
  channelId: string,
  options: { environmentId?: string | null; hosting?: "cloud" | "local" } = {},
): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
  const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);

  const channelRepoId = getChannelRepoId(channelId);

  try {
    const usesEnvironment = !!options.environmentId;
    const usesCloud = options.hosting === "cloud";
    const usesImplicitDefault = !usesEnvironment && options.hosting == null;
    const { runtimeInstanceId, unavailableReason } =
      usesEnvironment || usesCloud || usesImplicitDefault
        ? { runtimeInstanceId: undefined, unavailableReason: undefined }
        : await resolveDefaultRuntime(prefTool, channelRepoId);
    if (!usesEnvironment && !usesCloud && !usesImplicitDefault && !runtimeInstanceId) {
      throw new Error(quickSessionUnavailableMessage(unavailableReason));
    }
    const runtimeInput = usesImplicitDefault
      ? {}
      : usesEnvironment
        ? { environmentId: options.environmentId }
        : usesCloud
          ? { hosting: "cloud" as const }
          : { hosting: "local" as const, runtimeInstanceId };

    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: prefTool,
          model: prefModel ?? undefined,
          ...runtimeInput,
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
