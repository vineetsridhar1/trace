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
import {
  useUIStore,
  navigateToSession,
  getCurrentNavigationState,
  replaceNavigationState,
  registerOptimisticSessionRedirect,
} from "../stores/ui";
import { getDefaultModel } from "../components/session/modelOptions";
import { handleBridgeAccessError } from "./bridge-access-error";
import { useBridgeAuthStore } from "../stores/bridge-auth";

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
  const previousNav = getCurrentNavigationState();
  const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
  const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);
  const prefHosting = usePreferencesStore.getState().defaultHosting;

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

  // Generate temp IDs and navigate immediately
  const tempSessionId = crypto.randomUUID();
  const tempGroupId = crypto.randomUUID();
  const assumedHosting = prefHosting === "cloud" ? "cloud" : "local";

  optimisticallyInsertSessionGroup({
    id: tempGroupId,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    optimistic: true,
  });

  optimisticallyInsertSession({
    id: tempSessionId,
    sessionGroupId: tempGroupId,
    tool: prefTool,
    model: prefModel,
    hosting: assumedHosting,
    channel: { id: channelId },
    repo: channelRepoId ? { id: channelRepoId } : null,
    optimistic: true,
  });

  useUIStore.getState().openSessionTab(tempGroupId, tempSessionId);
  useUIStore.getState().setActiveSessionGroupId(tempGroupId, tempSessionId);

  const isStillOnTempRoute = () => {
    const ui = useUIStore.getState();
    return ui.activeSessionGroupId === tempGroupId && ui.activeSessionId === tempSessionId;
  };

  // Fire mutation in background, reconcile when done
  try {
    const { runtimeInstanceId, hosting } = await resolveDefaultRuntime(prefTool, channelRepoId);
    const isCloud = !runtimeInstanceId || hosting === "cloud";

    // Consume any verified bridge access token (set after successful verification)
    const bridgeAccessToken = useBridgeAuthStore.getState().consumeVerifiedChallengeId();

    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: prefTool,
          model: prefModel ?? undefined,
          hosting: isCloud ? "cloud" : undefined,
          runtimeInstanceId: isCloud ? undefined : runtimeInstanceId,
          channelId,
          repoId: channelRepoId ?? undefined,
          bridgeAccessToken: bridgeAccessToken ?? undefined,
        },
      })
      .toPromise();

    if (result.error) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      if (isStillOnTempRoute()) {
        replaceNavigationState(previousNav);
      } else {
        registerOptimisticSessionRedirect(tempGroupId, tempSessionId, previousNav);
      }
      // Check for bridge access required — open verification dialog
      if (
        handleBridgeAccessError(result.error, {
          action: "start_session",
          retryAction: () => createQuickSession(channelId),
        })
      ) {
        return;
      }
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const session = result.data?.startSession;
    if (!session?.id) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      if (isStillOnTempRoute()) {
        replaceNavigationState(previousNav);
      } else {
        registerOptimisticSessionRedirect(tempGroupId, tempSessionId, previousNav);
      }
      toast.error("Failed to create session", {
        description: "Server did not return a session ID",
      });
      return;
    }

    const realGroupId = session.sessionGroupId;
    if (!realGroupId) {
      rollbackOptimisticSession(tempSessionId, tempGroupId);
      if (isStillOnTempRoute()) {
        replaceNavigationState(previousNav);
      } else {
        registerOptimisticSessionRedirect(tempGroupId, tempSessionId, previousNav);
      }
      toast.error("Failed to create session", {
        description: "Server did not return a session group ID",
      });
      return;
    }

    // Reconcile: atomically swap temp entities for real ones
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
    if (isStillOnTempRoute()) {
      navigateToSession(channelId, realGroupId, session.id, { replace: true });
    } else {
      registerOptimisticSessionRedirect(tempGroupId, tempSessionId, {
        channelId,
        sessionGroupId: realGroupId,
        sessionId: session.id,
        page: "main",
        chatId: null,
        channelSubPage: previousNav.channelSubPage,
      });
    }
  } catch (err) {
    rollbackOptimisticSession(tempSessionId, tempGroupId);
    if (isStillOnTempRoute()) {
      replaceNavigationState(previousNav);
    } else {
      registerOptimisticSessionRedirect(tempGroupId, tempSessionId, previousNav);
    }
    if (
      handleBridgeAccessError(err, {
        action: "start_session",
        retryAction: () => createQuickSession(channelId),
      })
    ) {
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error("Failed to create session", { description: message });
  }
}
