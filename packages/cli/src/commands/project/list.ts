import { traceCliOperations } from "@trace/cli-contract";
import type { Project, Repo } from "@trace/gql";
import { defineCommand, optionString } from "../../runtime.js";
import { requireOrganizationId } from "../organization.js";

type ProjectView = Pick<Project, "id" | "name"> & { repo?: Pick<Repo, "id" | "name"> | null };

export const projectListCommand = defineCommand({
  path: ["project", "list"],
  description: "List projects in the current organization",
  options: [
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Only include projects linked to this repository",
    },
  ],
  async run(ctx, input) {
    const client = await ctx.client();
    const variables = {
      organizationId: requireOrganizationId(client.organizationId),
      repoId: optionString(input, "repo") ?? null,
    };
    const result = await client.graphql<{ projects: ProjectView[] }, typeof variables>(
      traceCliOperations.projects,
      variables,
    );
    ctx.output(
      { projects: result.projects },
      result.projects.length
        ? result.projects
            .map((project) => `${project.id}\t${project.name}\t${project.repo?.name ?? "no repo"}`)
            .join("\n")
        : "No projects found",
    );
  },
});
