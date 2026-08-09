import { traceCliOperations } from "@trace/cli-contract";
import type { QueuedMessage } from "@trace/gql";
import { randomUUID } from "node:crypto";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean, optionString } from "../../runtime.js";
import { resolveSessionId, type EventView } from "./shared.js";

export const sessionSendCommand = defineCommand({
  path: ["session", "send"],
  description: "Send or queue a message for a session",
  positionals: [{ name: "session-id" }, { name: "message", required: true, variadic: true }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" },
    {
      name: "queue",
      flag: "--queue",
      kind: "boolean",
      description: "Queue instead of interrupting the active turn",
    },
    {
      name: "interactionMode",
      flag: "--interaction-mode",
      kind: "string",
      valueName: "MODE",
      description: "Interaction mode override",
    },
  ],
  async run(ctx, input) {
    const values = [...input.positionals];
    const id = optionBoolean(input, "self")
      ? resolveSessionId(ctx)
      : resolveSessionId(ctx, values.shift());
    const text = values.join(" ").trim();
    if (!text) usage("Message text is required");
    const interactionMode = optionString(input, "interactionMode") ?? null;
    const client = await ctx.client();
    if (optionBoolean(input, "queue")) {
      const variables = { sessionId: id, text, interactionMode };
      const result = await client.graphql<{ queueSessionMessage: QueuedMessage }, typeof variables>(
        traceCliOperations.queueSessionMessage,
        variables,
      );
      ctx.output(
        { queuedMessage: result.queueSessionMessage },
        `Queued message (${result.queueSessionMessage.id})`,
      );
      return;
    }
    const variables = { sessionId: id, text, interactionMode, clientMutationId: randomUUID() };
    const result = await client.graphql<{ sendSessionMessage: EventView }, typeof variables>(
      traceCliOperations.sendSessionMessage,
      variables,
    );
    ctx.output(
      { event: result.sendSessionMessage },
      `Sent message (${result.sendSessionMessage.id})`,
    );
  },
});
