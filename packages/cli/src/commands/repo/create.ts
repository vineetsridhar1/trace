import { traceCliOperations } from "@trace/cli-contract";
import type { Repo } from "@trace/gql";
import { usage } from "../../errors.js";
import { defineCommand, optionString } from "../../runtime.js";
import { requireOrganizationId } from "../organization.js";

type RepoView = Pick<Repo, "id" | "name" | "provider" | "remoteUrl" | "defaultBranch">;

export const repoCreateCommand = defineCommand({
  path: ["repo", "create"],
  description: "Register a repository in the current organization",
  examples: [
    '"$TRACE_CLI" repo create app --json',
    '"$TRACE_CLI" repo create app --remote-url https://github.com/acme/app.git --default-branch main --json',
  ],
  effects: ["Creates a repository record and emits a repo-created event."],
  output: "The new repository ID, name, remote URL, and default branch.",
  nextSteps: [
    'Link it to a project with "$TRACE_CLI" channel link-repo <channel-id> <repo-id> --json.',
    'For a local-only repository, add a Git remote and run "$TRACE_CLI" repo attach-remote <repo-id> <remote-url> --json before starting a cloud coding session.',
  ],
  notes: [
    "This registers repository metadata in Trace; use git init separately to create a local Git repository.",
    "A matching remote URL returns the existing repository instead of creating a duplicate.",
    "This command does not create another project or channel.",
  ],
  positionals: [{ name: "name", required: true }],
  options: [
    {
      name: "remoteUrl",
      flag: "--remote-url",
      kind: "string",
      valueName: "URL",
      description: "Git remote URL; may be attached later",
    },
    {
      name: "defaultBranch",
      flag: "--default-branch",
      kind: "string",
      valueName: "NAME",
      description: "Default branch (defaults to main)",
    },
  ],
  async run(ctx, input) {
    const name = input.positionals[0]?.trim();
    if (!name) usage("A repository name is required");

    const client = await ctx.client();
    const variables = {
      input: {
        organizationId: requireOrganizationId(client.organizationId),
        name,
        remoteUrl: optionString(input, "remoteUrl")?.trim() || null,
        defaultBranch: optionString(input, "defaultBranch")?.trim() || "main",
      },
    };
    const result = await client.graphql<{ registerRepo: RepoView }, typeof variables>(
      traceCliOperations.registerRepo,
      variables,
    );
    ctx.output(
      { repo: result.registerRepo },
      `Registered ${result.registerRepo.name} (${result.registerRepo.id})`,
    );
  },
});
