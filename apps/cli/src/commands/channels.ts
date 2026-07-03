import type { Command } from "commander";
import { resolveServerUrl } from "../config.js";
import { graphqlRequest } from "../http.js";
import { formatTable } from "../output.js";
import { requireActiveOrg, resolveChannelByName } from "../resolve.js";
import {
  CHANNEL_HEADER,
  channelToJson,
  channelToRow,
  messageToJson,
  messageToLine,
  type ChannelListItem,
  type ChannelMessageItem,
} from "../views.js";

const CHANNELS_QUERY = `query($orgId: ID!) {
  channels(organizationId: $orgId) { id name type memberCount }
}`;

const CHANNEL_MESSAGES_QUERY = `query($channelId: ID!, $limit: Int) {
  channelMessages(channelId: $channelId, limit: $limit) {
    id text createdAt actor { type id name }
  }
}`;

export function registerChannelCommands(program: Command): void {
  const channels = program.command("channels").description("Work with channels");

  channels
    .command("list")
    .description("List channels in the active organization")
    .action(async (_opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      const data = await graphqlRequest<{ channels: ChannelListItem[] }>(
        serverUrl,
        CHANNELS_QUERY,
        {
          orgId,
        },
      );
      if (globals.json) {
        console.log(JSON.stringify(data.channels.map(channelToJson)));
        return;
      }
      if (data.channels.length === 0) {
        console.error("No channels found.");
        return;
      }
      console.log(formatTable([CHANNEL_HEADER, ...data.channels.map(channelToRow)]));
    });

  program
    .command("channel")
    .description("Show the most recent messages in a channel")
    .argument("<name>", "channel name")
    .option("--limit <n>", "number of messages to show", "20")
    .action(async (name: string, opts: { limit: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      const channel = await resolveChannelByName(serverUrl, orgId, name);
      const limit = Number.parseInt(opts.limit, 10);
      const data = await graphqlRequest<{ channelMessages: ChannelMessageItem[] }>(
        serverUrl,
        CHANNEL_MESSAGES_QUERY,
        { channelId: channel.id, limit: Number.isFinite(limit) ? limit : 20 },
      );
      if (globals.json) {
        console.log(
          JSON.stringify({
            channel: { id: channel.id, name: channel.name },
            messages: data.channelMessages.map(messageToJson),
          }),
        );
        return;
      }
      if (data.channelMessages.length === 0) {
        console.error(`No messages in #${channel.name}.`);
        return;
      }
      for (const message of data.channelMessages) {
        console.log(messageToLine(message));
      }
    });
}
