import { toast } from "sonner";
import type { Channel, CodingTool, Repo } from "@trace/gql";
import { START_SESSION_MUTATION } from "@trace/client-core";
import { client } from "./urql";
import { navigateToSession } from "../stores/ui";
import type { InteractionMode } from "../components/session/interactionModes";
import type { HomeCreatableKind } from "../components/home/home-kinds";

interface CreateHomeSessionInput {
  prompt: string;
  kind: HomeCreatableKind;
  tool: CodingTool;
  model: string | null;
  reasoningEffort: string | null;
  interactionMode: InteractionMode;
  repo: Repo | null;
  channels: Channel[];
}

export function buildHomeStartInput(
  input: Omit<CreateHomeSessionInput, "channels">,
  channel: Channel | null,
) {
  const linkedRepo = input.kind === "coding" ? input.repo : null;
  return {
    kind: input.kind,
    tool: input.tool,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    interactionMode: input.interactionMode,
    prompt: input.prompt.trim(),
    ...(linkedRepo ? { repoId: linkedRepo.id } : {}),
    ...(channel ? { channelId: channel.id } : {}),
    ...(input.kind !== "coding" ? { hosting: "cloud" as const } : {}),
  };
}

export function resolveHomeCodingChannel(
  kind: HomeCreatableKind,
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
  model,
  reasoningEffort,
  interactionMode,
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
        input: buildHomeStartInput(
          {
            prompt: normalizedPrompt,
            kind,
            tool,
            model,
            reasoningEffort,
            interactionMode,
            repo: linkedRepo,
          },
          channel,
        ),
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
