import type { Command } from "commander";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { resolveServerUrl } from "../config.js";
import { CHANNEL_EVENTS_SUBSCRIPTION } from "../documents.js";
import { createClientRuntime } from "../runtime.js";
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
    .option("--follow", "keep streaming new messages after the recent page")
    .action(async (name: string, opts: { limit: string; follow?: boolean }, cmd: Command) => {
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
        if (opts.follow) {
          await followChannel(serverUrl, orgId, channel.id, true);
        }
        return;
      }
      if (data.channelMessages.length === 0 && !opts.follow) {
        console.error(`No messages in #${channel.name}.`);
        return;
      }
      for (const message of data.channelMessages) {
        console.log(messageToLine(message));
      }
      if (opts.follow) {
        await followChannel(serverUrl, orgId, channel.id, Boolean(globals.json));
      }
    });
}

async function followChannel(
  serverUrl: string,
  orgId: string,
  channelId: string,
  json: boolean,
): Promise<void> {
  const runtime = createClientRuntime({
    serverUrl,
    onConnectionChange: (state) => console.error(`# ${state}`),
  });
  await runtime.start({ orgEvents: false });
  const subscription = runtime.gql
    .subscription(CHANNEL_EVENTS_SUBSCRIPTION, {
      channelId,
      organizationId: orgId,
      types: ["message_sent"],
    })
    .subscribe((result) => {
      if (result.error) {
        console.error(`# subscription error: ${result.error.message}`);
        return;
      }
      const event = (result.data as { channelEvents?: Event } | undefined)?.channelEvents;
      const payload = asJsonObject(event?.payload);
      if (!event || event.eventType !== "message_sent" || typeof payload?.text !== "string") return;
      const message: ChannelMessageItem = {
        id: typeof payload.messageId === "string" ? payload.messageId : event.id,
        text: payload.text,
        createdAt: event.timestamp,
        actor: {
          type: event.actor.type,
          id: event.actor.id,
          name: event.actor.name ?? null,
        },
      };
      console.log(json ? JSON.stringify(messageToJson(message)) : messageToLine(message));
    });

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
  });
  subscription.unsubscribe();
  await runtime.dispose();
}
