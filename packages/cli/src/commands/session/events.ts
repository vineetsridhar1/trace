import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean, optionInteger } from "../../runtime.js";
import { resolveSessionId, type EventView } from "./shared.js";

export const sessionEventsCommand = defineCommand({
  path: ["session", "events"],
  description: "Read a bounded event snapshot and optionally follow the session stream",
  examples: [
    '"$TRACE_CLI" session events <session-id> --limit 50 --json',
    '"$TRACE_CLI" session events <session-id> --follow --json',
  ],
  effects: ["Read-only; --follow keeps an event subscription open until it is stopped."],
  output: "A bounded event snapshot and, with --follow, one JSON event per subsequent line.",
  nextSteps: [
    "Use the snapshot to assess progress, then stop following once the requested condition is met.",
    'Run "$TRACE_CLI" session get <session-id> --json for the current status.',
  ],
  notes: ["Use --follow only for continuous monitoring; otherwise keep snapshots bounded with --limit."],
  positionals: [{ name: "session-id" }],
  options: [
    {
      name: "limit",
      flag: "--limit",
      kind: "integer",
      valueName: "N",
      min: 1,
      max: 500,
      description: "Maximum historical events",
    },
    {
      name: "follow",
      flag: "--follow",
      kind: "boolean",
      description: "Continue streaming new events",
    },
  ],
  async run(ctx, input) {
    const id = resolveSessionId(ctx, input.positionals[0]);
    const limit = optionInteger(input, "limit") ?? 50;
    const follow = optionBoolean(input, "follow");
    const client = await ctx.client();
    const organizationId = client.organizationId ?? usage("Organization is required");
    const variables = {
      organizationId,
      scope: { type: "session", id },
      limit,
      before: "9999-12-31T23:59:59.999Z",
    };
    const result = await client.graphql<{ events: EventView[] }, typeof variables>(
      traceCliOperations.sessionEvents,
      variables,
    );
    ctx.output(
      { events: result.events, following: follow },
      result.events.length
        ? result.events
            .map((event) => `${event.timestamp}\t${event.eventType}\t${event.id}`)
            .join("\n")
        : "No events found",
    );
    if (!follow) return;
    const cursor = result.events.at(-1);
    await client.subscribe<
      { sessionEvents: EventView },
      { sessionId: string; organizationId: string; after: string; afterEventId?: string }
    >(
      traceCliOperations.followSession,
      {
        sessionId: id,
        organizationId,
        after: cursor?.timestamp ?? "1970-01-01T00:00:00.000Z",
        ...(cursor ? { afterEventId: cursor.id } : {}),
      },
      (data) => {
        const event = data.sessionEvents;
        process.stdout.write(
          ctx.options.json
            ? `${JSON.stringify({ event })}\n`
            : `${event.timestamp}\t${event.eventType}\t${event.id}\n`,
        );
      },
    );
  },
});
