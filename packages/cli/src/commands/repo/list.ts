import { traceCliOperations } from "@trace/cli-contract";
import type { Repo } from "@trace/gql";
import { defineCommand } from "../../runtime.js";
import { requireOrganizationId } from "../organization.js";

type RepoView = Pick<Repo, "id" | "name" | "provider" | "remoteUrl" | "defaultBranch">;

export const repoListCommand = defineCommand({
  path: ["repo", "list"],
  description: "List repositories in the current organization",
  examples: ['"$TRACE_CLI" repo list --json'],
  effects: ["Read-only; does not clone, modify, or connect repositories."],
  output: "Repository IDs, providers, remote URLs, and default branches.",
  nextSteps: [
    'Pass a repository ID to "$TRACE_CLI" session start --repo <repo-id>.',
    'Run "$TRACE_CLI" channel list --json to find a channel already linked to a repository.',
  ],
  async run(ctx) {
    const client = await ctx.client();
    const variables = { organizationId: requireOrganizationId(client.organizationId) };
    const result = await client.graphql<{ repos: RepoView[] }, typeof variables>(
      traceCliOperations.repos,
      variables,
    );
    ctx.output(
      { repos: result.repos },
      result.repos.length
        ? result.repos
            .map((repo) => `${repo.id}\t${repo.name}\t${repo.provider}\t${repo.defaultBranch}`)
            .join("\n")
        : "No repositories found",
    );
  },
});
