import { traceCliOperations } from "@trace/cli-contract";
import type { Repo } from "@trace/gql";
import { usage } from "../../errors.js";
import { defineCommand } from "../../runtime.js";

type RepoView = Pick<Repo, "id" | "name" | "provider" | "remoteUrl" | "defaultBranch">;

export const repoAttachRemoteCommand = defineCommand({
  path: ["repo", "attach-remote"],
  description: "Attach a remote URL to a repository that does not have one",
  examples: ['"$TRACE_CLI" repo attach-remote <repo-id> https://github.com/acme/app.git --json'],
  effects: ["Adds the remote URL to the repository and emits a repo-updated event."],
  output: "The repository and its attached remote URL.",
  nextSteps: [
    'Run "$TRACE_CLI" repo list --json to verify the repository.',
    'Use "$TRACE_CLI" channel link-repo <channel-id> <repo-id> --json to provide channel context.',
  ],
  notes: ["The command is idempotent for the same URL and refuses to replace an existing remote."],
  positionals: [
    { name: "repo-id", required: true },
    { name: "remote-url", required: true },
  ],
  async run(ctx, input) {
    const repoId = input.positionals[0]?.trim();
    const remoteUrl = input.positionals[1]?.trim();
    if (!repoId || !remoteUrl) usage("A repository ID and remote URL are required");

    const variables = { repoId, remoteUrl };
    const result = await (
      await ctx.client()
    ).graphql<{ attachRepoRemote: RepoView }, typeof variables>(
      traceCliOperations.attachRepoRemote,
      variables,
    );
    ctx.output(
      { repo: result.attachRepoRemote },
      `Attached ${result.attachRepoRemote.remoteUrl} to ${result.attachRepoRemote.name}`,
    );
  },
});
