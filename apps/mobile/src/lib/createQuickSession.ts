import { router } from "expo-router";
import { Alert } from "react-native";
import {
  generateUUID,
  getSessionChannelId,
  getSessionGroupChannelId,
  insertOptimisticSessionPair,
  reconcileOptimisticSessionPair,
  rollbackOptimisticSessionPair,
  RUN_SESSION_MUTATION,
  START_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
  useEntityStore,
  type SessionEntity,
} from "@trace/client-core";
import { getDefaultModel } from "@trace/shared";
import type { CodingTool } from "@trace/gql";
import { getConnectionMode } from "@/lib/connection-target";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { resolveMobileSessionHosting } from "@/lib/session-hosting";
import { closeSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { fetchSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { useMobileUIStore } from "@/stores/ui";

const DEFAULT_TOOL: CodingTool = "claude_code";

interface CreateAgentTabOptions {
  navigate?: (sessionGroupId: string, sessionId: string) => void;
}

/**
 * Mobile twin of web's `createQuickSession`: inserts optimistic session
 * entities, routes to the temp session page, and fires the real mutation
 * in the background. When the server responds, the temp entities are
 * swapped for the real ones and the route is updated in place.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  const channel = useEntityStore.getState().channels[channelId];
  const channelRepoId = channel?.repo?.id;

  const tempSessionId = generateUUID();
  const tempGroupId = generateUUID();
  const tool = DEFAULT_TOOL;
  const model = getDefaultModel(tool);
  const hosting = resolveMobileSessionHosting(getConnectionMode());

  insertOptimisticSessionPair({
    tempSessionId,
    tempGroupId,
    tool,
    model,
    hosting,
    channelId,
    repoId: channelRepoId,
  });
  void haptic.light();
  tryOpenSessionPlayer(tempSessionId);

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(
        START_SESSION_MUTATION,
        {
          input: {
            tool,
            model,
            hosting,
            channelId,
            repoId: channelRepoId,
          },
        },
      )
      .toPromise();
    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    // Swap entities first, then retarget the route so the page never
    // dereferences a deleted temp id. React batches these updates.
    reconcileOptimisticSessionPair({
      tempSessionId,
      tempGroupId,
      realSessionId: session.id,
      realGroupId: session.sessionGroupId,
      tool,
      model,
      hosting,
      channelId,
      repoId: channelRepoId,
    });
    const ui = useMobileUIStore.getState();
    if (ui.overlaySessionId === tempSessionId) {
      ui.setOverlaySessionId(session.id);
      router.replace(`/sessions/${session.sessionGroupId}/${session.id}` as never);
    }
  } catch (err) {
    rollbackOptimisticSessionPair({ tempSessionId, tempGroupId });
    // Only close the routed session view if it's still pointed at the temp
    // session — the user may have navigated elsewhere while the mutation
    // was in flight.
    const ui = useMobileUIStore.getState();
    if (ui.overlaySessionId === tempSessionId) {
      closeSessionPlayer();
    }
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't start session", message);
  }
}

/**
 * Create a sibling session inside the current workspace and switch the
 * session page to it, matching the web app's "new tab" behavior.
 */
export async function createAgentTab(
  sourceSessionId: string,
  options?: CreateAgentTabOptions,
): Promise<void> {
  const state = useEntityStore.getState();
  const sourceSession = state.sessions[sourceSessionId];
  const sessionGroupId = sourceSession?.sessionGroupId;

  if (!sourceSession || !sessionGroupId || sourceSession._optimistic) {
    void haptic.error();
    Alert.alert("Couldn't create agent tab", "This session isn't ready yet. Try again.");
    return;
  }

  const group = state.sessionGroups[sessionGroupId] ?? null;
  const groupSessions = (state._sessionIdsByGroup[sessionGroupId] ?? [])
    .map((id) => state.sessions[id])
    .filter((session): session is SessionEntity => session !== undefined);
  const channelId =
    getSessionGroupChannelId(group, groupSessions) ?? getSessionChannelId(sourceSession) ?? undefined;
  const groupRepo = group?.repo as { id: string } | null | undefined;
  const sourceRepo = sourceSession.repo as { id: string } | null | undefined;

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(
        START_SESSION_MUTATION,
        {
          input: {
            tool: sourceSession.tool as CodingTool,
            model: sourceSession.model ?? undefined,
            hosting: sourceSession.hosting,
            channelId,
            repoId: groupRepo?.id ?? sourceRepo?.id,
            branch: group?.branch ?? sourceSession.branch ?? undefined,
            sessionGroupId,
            sourceSessionId,
          },
        },
      )
      .toPromise();

    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    const hydrated = await fetchSessionGroupDetail(session.sessionGroupId);
    if (!hydrated && !useEntityStore.getState().sessions[session.id]?.sessionGroupId) {
      throw new Error("Couldn't load the new agent tab");
    }
    if (options?.navigate) {
      options.navigate(session.sessionGroupId, session.id);
    } else {
      const ui = useMobileUIStore.getState();
      ui.setOverlaySessionId(session.id);
      router.replace(`/sessions/${session.sessionGroupId}/${session.id}` as never);
    }
    void haptic.success();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't create agent tab", message);
  }
}

/**
 * Start a fresh session from an approved plan, switch the mobile UI to it,
 * and retire the prior session so implementation continues in a clean context.
 */
export async function startPlanImplementationSession(
  sourceSessionId: string,
  planContent: string,
): Promise<boolean> {
  const state = useEntityStore.getState();
  const sourceSession = state.sessions[sourceSessionId];
  const sessionGroupId = sourceSession?.sessionGroupId;

  if (!sourceSession || !sessionGroupId || sourceSession._optimistic) {
    void haptic.error();
    Alert.alert("Couldn't start implementation", "This session isn't ready yet. Try again.");
    return false;
  }

  const group = state.sessionGroups[sessionGroupId] ?? null;
  const groupSessions = (state._sessionIdsByGroup[sessionGroupId] ?? [])
    .map((id) => state.sessions[id])
    .filter((session): session is SessionEntity => session !== undefined);
  const channelId =
    getSessionGroupChannelId(group, groupSessions) ?? getSessionChannelId(sourceSession) ?? undefined;
  const groupRepo = group?.repo as { id: string } | null | undefined;
  const sourceRepo = sourceSession.repo as { id: string } | null | undefined;
  const prompt = `Implement the following plan:\n\n${planContent}`;

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(
        START_SESSION_MUTATION,
        {
          input: {
            tool: sourceSession.tool as CodingTool,
            model: sourceSession.model ?? undefined,
            hosting: sourceSession.hosting,
            channelId,
            repoId: groupRepo?.id ?? sourceRepo?.id,
            branch: group?.branch ?? sourceSession.branch ?? undefined,
            sessionGroupId,
            sourceSessionId,
            prompt,
          },
        },
      )
      .toPromise();

    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    const runResult = await getClient()
      .mutation(RUN_SESSION_MUTATION, { id: session.id, prompt })
      .toPromise();
    if (runResult.error) throw runResult.error;

    const hydrated = await fetchSessionGroupDetail(session.sessionGroupId);
    if (!hydrated && !useEntityStore.getState().sessions[session.id]?.sessionGroupId) {
      throw new Error("Couldn't load the new session");
    }

    const ui = useMobileUIStore.getState();
    ui.setOverlaySessionId(session.id);
    router.replace(`/sessions/${session.sessionGroupId}/${session.id}` as never);

    void haptic.success();

    void getClient()
      .mutation(TERMINATE_SESSION_MUTATION, { id: sourceSessionId })
      .toPromise()
      .catch((error: unknown) => {
        console.error("Failed to terminate plan session:", error);
      });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't start implementation", message);
    return false;
  }
}
