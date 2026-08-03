import { router } from "expo-router";
import { Alert } from "react-native";
import {
  getSessionChannelId,
  getSessionGroupChannelId,
  START_SESSION_MUTATION,
  useEntityStore,
  type SessionEntity,
} from "@trace/client-core";
import { gql } from "@urql/core";
import type { CodingTool } from "@trace/gql";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { fetchSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { useMobileUIStore } from "@/stores/ui";

const pendingQuickSessionChannels = new Set<string>();
const pendingGeneratedSessionKinds = new Set<"app" | "design">();

const APPROVE_PLAN_ARTIFACT_MUTATION = gql`
  mutation MobileImplementPlanArtifact(
    $artifactId: ID!
    $action: ArtifactApprovalAction!
    $prompt: String!
  ) {
    approveArtifact(artifactId: $artifactId, action: $action, prompt: $prompt) {
      implementationSession {
        id
        sessionGroupId
      }
    }
  }
`;

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

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(START_SESSION_MUTATION, {
        input: {
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

/** Create a standalone cloud-generated session and open its empty composer. */
export async function createGeneratedSession(
  kind: "app" | "design",
  designSystemVersionId?: string,
): Promise<boolean> {
  if (pendingGeneratedSessionKinds.has(kind)) return false;
  pendingGeneratedSessionKinds.add(kind);
  const label = kind === "design" ? "design" : "application";

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(START_SESSION_MUTATION, {
        input: {
          kind,
          hosting: "cloud",
          ...(designSystemVersionId ? { designSystemVersionId } : {}),
        },
      })
      .toPromise();
    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    void fetchSessionGroupDetail(session.sessionGroupId).catch((error: unknown) => {
      console.warn("[createGeneratedSession] failed to prefetch session group", error);
    });

    const ui = useMobileUIStore.getState();
    ui.setOverlaySessionId(session.id);
    router.replace(`/sessions/${session.sessionGroupId}/${session.id}` as never);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert(`Couldn't create ${label}`, message);
    return false;
  } finally {
    pendingGeneratedSessionKinds.delete(kind);
  }
}

export function createApplication(): Promise<boolean> {
  return createGeneratedSession("app");
}

export function createDesign(designSystemVersionId?: string): Promise<boolean> {
  return createGeneratedSession("design", designSystemVersionId);
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
          reasoningEffort: sourceSession.reasoningEffort ?? undefined,
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
 * Approve a plan and switch the mobile UI to the server-created implementation session.
 */
export async function startPlanImplementationSession(
  artifactId: string,
  planContent: string,
): Promise<boolean> {
  const prompt = `Implement the following plan:\n\n${planContent}`;

  void haptic.light();

  try {
    const result = await getClient()
      .mutation<{
        approveArtifact: {
          implementationSession: { id: string; sessionGroupId: string } | null;
        };
      }>(APPROVE_PLAN_ARTIFACT_MUTATION, {
        artifactId,
        action: "NEW_SESSION",
        prompt,
      })
      .toPromise();

    if (result.error) throw result.error;
    const session = result.data?.approveArtifact?.implementationSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    const hydrated = await fetchSessionGroupDetail(session.sessionGroupId);
    if (!hydrated.ok && !useEntityStore.getState().sessions[session.id]?.sessionGroupId) {
      throw new Error(hydrated.error ?? "Couldn't load the new session");
    }

    const ui = useMobileUIStore.getState();
    ui.setOverlaySessionId(session.id);
    router.replace(`/sessions/${session.sessionGroupId}/${session.id}` as never);

    void haptic.success();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't start implementation", message);
    return false;
  }
}
