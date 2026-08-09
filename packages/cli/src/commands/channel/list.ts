import { traceCliOperations } from "@trace/cli-contract";
import type { Channel, Project, Repo } from "@trace/gql";
import { defineCommand, optionBoolean } from "../../runtime.js";
import { requireOrganizationId } from "../organization.js";

type ChannelView = Pick<
  Channel,
  "id" | "name" | "type" | "visibility" | "baseBranch" | "viewerIsMember"
> & {
  repo?: Pick<Repo, "id" | "name"> | null;
  projects: Array<Pick<Project, "id" | "name">>;
};

export const channelListCommand = defineCommand({
  path: ["channel", "list"],
  description: "List channels available to the session owner",
  options: [
    {
      name: "memberOnly",
      flag: "--member-only",
      kind: "boolean",
      description: "Only include channels the session owner has joined",
    },
  ],
  async run(ctx, input) {
    const client = await ctx.client();
    const variables = {
      organizationId: requireOrganizationId(client.organizationId),
      memberOnly: optionBoolean(input, "memberOnly"),
    };
    const result = await client.graphql<{ channels: ChannelView[] }, typeof variables>(
      traceCliOperations.channels,
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
});
