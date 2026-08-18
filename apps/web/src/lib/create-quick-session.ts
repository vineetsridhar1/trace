import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, useEntityStore } from "@trace/client-core";
import { navigateToSession, navigateToSessionGroup } from "../stores/ui";
import type { CreatableGeneratedProjectKind } from "../components/sidebar/generated-project-types";
import { buildQuickSessionStartInput, type QuickSessionOptions } from "./quick-session-input";

const pendingQuickSessionChannels = new Set<string>();
const pendingGeneratedProjectKinds = new Set<CreatableGeneratedProjectKind>();

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
  options: QuickSessionOptions = {},
): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const channelRepoId = getChannelRepoId(channelId);

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: buildQuickSessionStartInput(channelId, channelRepoId, options),
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

/**
 * Start flexible work in a project. The general session inherits the project's
 * repository as context and can later convert in place to coding or an artifact.
 */
export function createProjectSession(
  channelId: string,
  options: Omit<QuickSessionOptions, "kind" | "sessionGroupId"> = {},
): Promise<void> {
  return createQuickSession(channelId, { ...options, kind: "general" });
}

export function buildGeneratedProjectStartInput(
  kind: CreatableGeneratedProjectKind,
  designSystemVersionId?: string,
  channelId?: string | null,
) {
  return {
    kind,
    hosting: "cloud" as const,
    ...(channelId ? { channelId } : {}),
    ...(kind === "design" && designSystemVersionId ? { designSystemVersionId } : {}),
  };
}

export async function createAppSession(channelId?: string | null): Promise<boolean> {
  return createGeneratedProjectSession("app", undefined, channelId);
}

export async function createDesignSession(
  designSystemVersionId?: string,
  channelId?: string | null,
): Promise<boolean> {
  return createGeneratedProjectSession("design", designSystemVersionId, channelId);
}

export async function createPdfSession(channelId?: string | null): Promise<boolean> {
  return createGeneratedProjectSession("pdf", undefined, channelId);
}

export async function createAnimationSession(channelId?: string | null): Promise<boolean> {
  return createGeneratedProjectSession("animation", undefined, channelId);
}

async function createGeneratedProjectSession(
  kind: CreatableGeneratedProjectKind,
  designSystemVersionId?: string,
  channelId?: string | null,
): Promise<boolean> {
  if (pendingGeneratedProjectKinds.has(kind)) return false;
  pendingGeneratedProjectKinds.add(kind);
  const label = kind;

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: buildGeneratedProjectStartInput(kind, designSystemVersionId, channelId),
      })
      .toPromise();

    if (result.error) {
      toast.error(`Failed to create ${label} session`, { description: result.error.message });
      return false;
    }

    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      toast.error(`Failed to create ${label} session`, {
        description: "Server did not return a session.",
      });
      return false;
    }

    navigateToSessionGroup(channelId ?? null, session.sessionGroupId, session.id);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Failed to create ${label} session`, { description: message });
    return false;
  } finally {
    pendingGeneratedProjectKinds.delete(kind);
  }
}
