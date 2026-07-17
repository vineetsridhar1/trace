import { toast } from "sonner";
import { client } from "./urql";
import { START_SESSION_MUTATION, useEntityStore } from "@trace/client-core";
import { navigateToSession, navigateToSessionGroup } from "../stores/ui";

const pendingQuickSessionChannels = new Set<string>();
const pendingGeneratedProjectKinds = new Set<"app" | "design">();

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
  options: { visibility?: "public" | "private" } = {},
): Promise<void> {
  if (pendingQuickSessionChannels.has(channelId)) return;
  pendingQuickSessionChannels.add(channelId);

  const channelRepoId = getChannelRepoId(channelId);

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          deferRuntimeSelection: true,
          channelId,
          repoId: channelRepoId ?? undefined,
          visibility: options.visibility,
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

export async function createAppSession(prompt: string): Promise<boolean> {
  return createGeneratedProjectSession("app", prompt);
}

export function buildGeneratedProjectStartInput(kind: "app" | "design", prompt: string) {
  return {
    kind,
    hosting: "cloud" as const,
    prompt: prompt.trim(),
    // Generated-project dialogs deliberately have no runtime picker. Codex is
    // the cloud runtime's built-in path, whereas the historical Claude default
    // requires a separately configured Anthropic key and otherwise leaves a
    // newly-created design session unable to run its initial prompt.
    tool: "codex" as const,
  };
}

export async function createDesignSession(prompt: string): Promise<boolean> {
  return createGeneratedProjectSession("design", prompt);
}

async function createGeneratedProjectSession(
  kind: "app" | "design",
  prompt: string,
): Promise<boolean> {
  if (pendingGeneratedProjectKinds.has(kind)) return false;
  pendingGeneratedProjectKinds.add(kind);
  const label = kind === "design" ? "design" : "app";

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: buildGeneratedProjectStartInput(kind, prompt),
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

    navigateToSessionGroup(null, session.sessionGroupId, session.id);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Failed to create ${label} session`, { description: message });
    return false;
  } finally {
    pendingGeneratedProjectKinds.delete(kind);
  }
}
