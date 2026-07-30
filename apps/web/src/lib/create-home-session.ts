import { toast } from "sonner";
import type { Channel, CodingTool, Repo, SessionGroupKind } from "@trace/gql";
import { START_SESSION_MUTATION } from "@trace/client-core";
import { client } from "./urql";
import { navigateToSession } from "../stores/ui";

interface CreateHomeSessionInput {
  prompt: string;
  kind: SessionGroupKind;
  tool: CodingTool;
  repo: Repo | null;
  channels: Channel[];
}

export function resolveHomeCodingChannel(
  kind: SessionGroupKind,
  repo: Repo | null,
  channels: Channel[],
): Channel | null {
  if (kind !== "coding" || !repo) return null;
  return (
    channels.find((channel) => channel.type === "coding" && channel.repo?.id === repo.id) ?? null
  );
}

export async function createHomeSession({
  prompt,
  kind,
  tool,
  repo,
  channels,
}: CreateHomeSessionInput): Promise<boolean> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return false;

  const linkedRepo = kind === "coding" ? repo : null;
  const channel = resolveHomeCodingChannel(kind, linkedRepo, channels);

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          kind,
          tool,
          prompt: normalizedPrompt,
          ...(linkedRepo ? { repoId: linkedRepo.id } : {}),
          ...(channel ? { channelId: channel.id } : {}),
          ...(kind !== "coding" ? { hosting: "cloud" } : {}),
        },
      })
      .toPromise();

    if (result.error) {
      toast.error("Could not start session", { description: result.error.message });
      return false;
    }

    const sessionId = result.data?.startSession?.id;
    const sessionGroupId = result.data?.startSession?.sessionGroupId;
    if (!sessionId || !sessionGroupId) {
      toast.error("Could not start session", {
        description: "Trace did not return the new session.",
      });
      return false;
    }

    navigateToSession(channel?.id ?? null, sessionGroupId, sessionId);
    return true;
  } catch (error) {
    toast.error("Could not start session", {
      description: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
