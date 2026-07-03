import type { Command } from "commander";
import { resolveServerUrl } from "../config.js";
import { sendToChannel, withGqlClient } from "../mutations.js";
import { requireActiveOrg, resolveChannelByName } from "../resolve.js";

export function registerSendCommand(program: Command): void {
  program
    .command("send")
    .description("Send a message to a channel (fire-and-forget)")
    .argument("<channel>", "channel name")
    .requiredOption("-m, --message <text>", "message text")
    .action(async (channelName: string, opts: { message: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      const channel = await resolveChannelByName(serverUrl, orgId, channelName);
      const message = await withGqlClient(serverUrl, (client) =>
        sendToChannel(client, channel, opts.message),
      );
      if (globals.json) {
        console.log(JSON.stringify({ id: message.id, channelId: channel.id }));
        return;
      }
      console.log(`Sent ${message.id} to #${channel.name}`);
    });
}
