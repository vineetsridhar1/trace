import { traceCliOperations } from "@trace/cli-contract";
import type { SessionFilters } from "@trace/gql";
import { defineCommand, optionBoolean, optionInteger, optionString } from "../../runtime.js";
import { AGENT_STATUSES, CODING_TOOLS, type SessionView } from "./shared.js";

export const sessionListCommand = defineCommand({
  path: ["session", "list"],
  description: "List sessions visible to the session owner",
  options: [
    {
      name: "status",
      flag: "--status",
      kind: "string",
      valueName: "STATUS",
      choices: AGENT_STATUSES,
      description: "Filter by agent status",
    },
    {
      name: "tool",
      flag: "--tool",
      kind: "string",
      valueName: "TOOL",
      choices: CODING_TOOLS,
      description: "Filter by coding tool",
    },
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Filter by repository",
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Filter by channel",
    },
    {
      name: "limit",
      flag: "--limit",
      kind: "integer",
      valueName: "N",
      min: 1,
      max: 500,
      description: "Maximum sessions to return",
    },
    {
      name: "includeArchived",
      flag: "--include-archived",
      kind: "boolean",
      description: "Include archived groups",
    },
    {
      name: "includeMerged",
      flag: "--include-merged",
      kind: "boolean",
      description: "Include merged sessions",
    },
  ],
  async run(ctx, input) {
    const client = await ctx.client();
    const filters: SessionFilters = {
      includeArchived: optionBoolean(input, "includeArchived"),
      includeMerged: optionBoolean(input, "includeMerged"),
      agentStatus: optionString(input, "status") as SessionFilters["agentStatus"],
      tool: optionString(input, "tool") as SessionFilters["tool"],
      repoId: optionString(input, "repo"),
      channelId: optionString(input, "channel"),
      limit: optionInteger(input, "limit"),
    };
    const variables = { organizationId: client.organizationId!, filters };
    const result = await client.graphql<{ sessions: SessionView[] }, typeof variables>(
      traceCliOperations.sessions,
      variables,
    );
    ctx.output(
      { sessions: result.sessions },
      result.sessions.length
        ? result.sessions
            .map(
              (session) =>
                `${session.id}\t${session.name}\t${session.agentStatus}\t${session.tool}`,
            )
            .join("\n")
        : "No sessions found",
    );
  },
});
