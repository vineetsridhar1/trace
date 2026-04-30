import { router } from "expo-router";
import { Alert } from "react-native";
import {
  getSessionChannelId,
  getSessionGroupChannelId,
  RUN_SESSION_MUTATION,
  START_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
  useEntityStore,
  type SessionEntity,
} from "@trace/client-core";
import { getDefaultModel } from "@trace/shared";
import type { CodingTool } from "@trace/gql";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { fetchSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { useMobileUIStore } from "@/stores/ui";

const DEFAULT_TOOL: CodingTool = "claude_code";
const pendingQuickSessionChannels = new Set<string>();

interface CreateAgentTabOptions {
  navigate?: (sessionGroupId: string, sessionId: string) => void;
}

/**
 * Start the session, prefetch its workspace, then open the session page.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const channel = useEntityStore.getState().channels[channelId];
  const channelRepoId = channel?.repo?.id;

  const tool = DEFAULT_TOOL;
  const model = getDefaultModel(tool);

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(START_SESSION_MUTATION, {
        input: {
          tool,
          model,
          deferRuntimeSelection: true,
          channelId,
          repoId: channelRepoId,
        },
      })
      .toPromise();
    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    void fetchSessionGroupDetail(session.sessionGroupId).catch((error: unknown) => {
      console.warn("[createQuickSession] failed to prefetch session group", error);
    });

    const ui = useMobileUIStore.getState();
    ui.setOverlaySessionId(session.id);
    router.push(`/sessions/${session.sessionGroupId}/${session.id}` as never);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't start session", message);
  } finally {
    pendingQuickSessionChannels.delete(channelId);
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
    getSessionGroupChannelId(group, groupSessions) ??
    getSessionChannelId(sourceSession) ??
    undefined;
  const groupRepo = group?.repo as { id: string } | null | undefined;
  const sourceRepo = sourceSession.repo as { id: string } | null | undefined;

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(START_SESSION_MUTATION, {
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
      })
      .toPromise();

    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    const hydrated = await fetchSessionGroupDetail(session.sessionGroupId);
    if (!hydrated.ok && !useEntityStore.getState().sessions[session.id]?.sessionGroupId) {
      throw new Error(hydrated.error ?? "Couldn't load the new agent tab");
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
    getSessionGroupChannelId(group, groupSessions) ??
    getSessionChannelId(sourceSession) ??
    undefined;
  const groupRepo = group?.repo as { id: string } | null | undefined;
  const sourceRepo = sourceSession.repo as { id: string } | null | undefined;
  const prompt = `Implement the following plan:\n\n${planContent}`;

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(START_SESSION_MUTATION, {
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
      })
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
