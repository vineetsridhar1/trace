import type { Channel, Project, Repo } from "@trace/gql";
import { usage } from "../errors.js";
import type { Command } from "../runtime.js";

type RepoView = Pick<Repo, "id" | "name" | "provider" | "remoteUrl" | "defaultBranch">;
type ProjectView = Pick<Project, "id" | "name"> & { repo?: Pick<Repo, "id" | "name"> | null };
type ChannelView = Pick<
  Channel,
  "id" | "name" | "type" | "visibility" | "baseBranch" | "viewerIsMember"
> & {
  repo?: Pick<Repo, "id" | "name"> | null;
  projects: Array<Pick<Project, "id" | "name">>;
};

function organizationId(value: string | undefined): string {
  return value || usage("The Trace organization is unavailable in this session");
}

export const resourceCommands: Command[] = [
  {
    path: ["channel", "list"],
    usage: "trace channel list [--member-only] [--json]",
    description: "List channels available to the session owner",
    async run(ctx) {
      const unexpected = ctx.args.slice(2).find((value) => value !== "--member-only");
      if (unexpected) usage(`Unexpected argument: ${unexpected}`);
      const client = await ctx.client();
      const variables = {
        organizationId: organizationId(client.organizationId),
        memberOnly: ctx.args.includes("--member-only"),
      };
      const result = await client.graphql<{ channels: ChannelView[] }, typeof variables>(
        `query TraceCliChannels($organizationId: ID!, $memberOnly: Boolean) {
          channels(organizationId: $organizationId, memberOnly: $memberOnly) {
            id name type visibility baseBranch viewerIsMember
            repo { id name }
            projects { id name }
          }
        }`,
        variables,
      );
      ctx.output(
        { channels: result.channels },
        result.channels.length
          ? result.channels
              .map(
                (channel) =>
                  `${channel.id}\t${channel.name}\t${channel.visibility}\t${channel.repo?.name ?? "no repo"}`,
              )
              .join("\n")
          : "No channels found",
      );
    },
  },
  {
    path: ["repo", "list"],
    usage: "trace repo list [--json]",
    description: "List repositories in the current organization",
    async run(ctx) {
      if (ctx.args[2]) usage(`Unexpected argument: ${ctx.args[2]}`);
      const client = await ctx.client();
      const variables = { organizationId: organizationId(client.organizationId) };
      const result = await client.graphql<{ repos: RepoView[] }, typeof variables>(
        `query TraceCliRepos($organizationId: ID!) {
          repos(organizationId: $organizationId) { id name provider remoteUrl defaultBranch }
        }`,
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
  },
  {
    path: ["project", "list"],
    usage: "trace project list [--repo ID] [--json]",
    description: "List projects in the current organization",
    async run(ctx) {
      let repoId: string | undefined;
      for (let index = 2; index < ctx.args.length; index += 1) {
        const value = ctx.args[index];
        if (value === "--repo") repoId = ctx.args[++index] || usage("--repo requires an ID");
        else usage(`Unexpected argument: ${value}`);
      }
      const client = await ctx.client();
      const variables = {
        organizationId: organizationId(client.organizationId),
        repoId: repoId ?? null,
      };
      const result = await client.graphql<{ projects: ProjectView[] }, typeof variables>(
        `query TraceCliProjects($organizationId: ID!, $repoId: ID) {
          projects(organizationId: $organizationId, repoId: $repoId) { id name repo { id name } }
        }`,
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
  },
];
