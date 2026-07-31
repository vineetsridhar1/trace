import { toast } from "sonner";
import type { Channel, CodingTool } from "@trace/gql";
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
  channel: Channel | null;
  projectId: string | null;
  repoId: string | null;
  runtimeInstanceId: string | null;
  designSystemVersionId: string | null;
  designSessionGroupId: string | null;
}

export function buildHomeStartInput(input: CreateHomeSessionInput) {
  const codingChannel = input.kind === "coding" ? input.channel : null;
  const linkedRepoId = input.kind === "coding" ? input.repoId : null;
  return {
    kind: input.kind,
    tool: input.tool,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    interactionMode: input.interactionMode,
    prompt: input.prompt.trim(),
    ...(linkedRepoId ? { repoId: linkedRepoId } : {}),
    ...(codingChannel ? { channelId: codingChannel.id } : {}),
    ...(input.kind === "coding" && input.projectId ? { projectId: input.projectId } : {}),
    ...(input.kind === "coding"
      ? {
          hosting: "local" as const,
          ...(input.runtimeInstanceId ? { runtimeInstanceId: input.runtimeInstanceId } : {}),
        }
      : { hosting: "cloud" as const }),
    ...(input.kind === "design" && input.designSystemVersionId
      ? { designSystemVersionId: input.designSystemVersionId }
      : {}),
    ...(input.kind !== "design" && input.designSessionGroupId
      ? { designSessionGroupId: input.designSessionGroupId }
      : {}),
  };
}

export async function createHomeSession({
  prompt,
  kind,
  tool,
  model,
  reasoningEffort,
  interactionMode,
  channel,
  projectId,
  repoId,
  runtimeInstanceId,
  designSystemVersionId,
  designSessionGroupId,
}: CreateHomeSessionInput): Promise<boolean> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return false;

  try {
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: buildHomeStartInput({
          prompt: normalizedPrompt,
          kind,
          tool,
          model,
          reasoningEffort,
          interactionMode,
          channel,
          projectId,
          repoId,
          runtimeInstanceId,
          designSystemVersionId,
          designSessionGroupId,
        }),
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
