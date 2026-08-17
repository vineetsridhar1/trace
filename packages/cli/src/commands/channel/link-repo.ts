import { traceCliOperations } from "@trace/cli-contract";
import type { Channel, Repo } from "@trace/gql";
import { usage } from "../../errors.js";
import { defineCommand, optionString } from "../../runtime.js";

type LinkedChannel = Pick<Channel, "id" | "name" | "baseBranch"> & {
  repo: Pick<Repo, "id" | "name" | "remoteUrl" | "defaultBranch">;
};

export const channelLinkRepoCommand = defineCommand({
  path: ["channel", "link-repo"],
  description: "Link a repository to a channel that does not have one",
  examples: [
    '"$TRACE_CLI" channel link-repo <channel-id> <repo-id> --json',
    '"$TRACE_CLI" channel link-repo <channel-id> <repo-id> --branch develop --json',
  ],
  effects: ["Links the repository to the channel and emits a channel-updated event."],
  output: "The channel, linked repository, and selected base branch.",
  nextSteps: [
    'If the repository has no remote URL, run "$TRACE_CLI" repo attach-remote <repo-id> <remote-url> --json.',
    "New artifacts and sessions in the channel can now inherit the repository context.",
  ],
  notes: [
    "The command is idempotent for the same repository and refuses to replace an existing link.",
  ],
  positionals: [
    { name: "channel-id", required: true },
    { name: "repo-id", required: true },
  ],
  options: [
    {
      name: "branch",
      flag: "--branch",
      kind: "string",
      valueName: "NAME",
      description: "Base branch; defaults to the repository default branch",
    },
  ],
  async run(ctx, input) {
    const channelId = input.positionals[0]?.trim();
    const repoId = input.positionals[1]?.trim();
    if (!channelId || !repoId) usage("A channel ID and repository ID are required");

    const variables = {
      channelId,
      repoId,
      baseBranch: optionString(input, "branch"),
    };
    const result = await (
      await ctx.client()
    ).graphql<{ linkChannelRepo: LinkedChannel }, typeof variables>(
      traceCliOperations.linkChannelRepo,
      variables,
    );
    ctx.output(
      { channel: result.linkChannelRepo },
      `Linked ${result.linkChannelRepo.name} to ${result.linkChannelRepo.repo.name} (${result.linkChannelRepo.baseBranch})`,
    );
  },
});
