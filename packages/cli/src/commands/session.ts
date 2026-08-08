import type { Event, Session } from "@trace/gql";
import { randomUUID } from "node:crypto";
import { usage } from "../errors.js";
import type { Command, CommandContext } from "../runtime.js";

type SessionView = Pick<
  Session,
  | "id"
  | "name"
  | "agentStatus"
  | "sessionStatus"
  | "tool"
  | "model"
  | "hosting"
  | "branch"
  | "sessionGroupId"
  | "createdAt"
  | "updatedAt"
>;

type EventView = Pick<
  Event,
  "id" | "eventType" | "scopeType" | "scopeId" | "timestamp" | "payload"
>;

const SESSION_FIELDS = `
  id name agentStatus sessionStatus tool model hosting branch sessionGroupId createdAt updatedAt
`;
const EVENT_FIELDS = `id eventType scopeType scopeId timestamp payload`;

function sessionId(ctx: CommandContext, position = 2): string {
  const explicit = ctx.args[position];
  const implicit = ctx.env.TRACE_SESSION_ID;
  return explicit || implicit || usage("Session ID is required outside a Trace session");
}

function printSession(session: SessionView): string {
  return [
    `${session.name} (${session.id})`,
    `Status: ${session.sessionStatus} / ${session.agentStatus}`,
    `Tool: ${session.tool}${session.model ? ` (${session.model})` : ""}`,
    `Hosting: ${session.hosting}`,
    `Group: ${session.sessionGroupId ?? "none"}`,
    ...(session.branch ? [`Branch: ${session.branch}`] : []),
  ].join("\n");
}

async function getSession(ctx: CommandContext, id: string): Promise<SessionView> {
  const client = await ctx.client();
  const result = await client.graphql<{ session: SessionView | null }, { id: string }>(
    `query TraceCliSession($id: ID!) { session(id: $id) { ${SESSION_FIELDS} } }`,
    { id },
  );
  if (!result.session) usage(`Session not found: ${id}`);
  return result.session;
}

export const sessionCommands: Command[] = [
  {
    path: ["session", "get"],
    usage: "trace session get [session-id] [--json]",
    description: "Get a session, defaulting to TRACE_SESSION_ID",
    async run(ctx) {
      const session = await getSession(ctx, sessionId(ctx));
      ctx.output({ session }, printSession(session));
    },
  },
  {
    path: ["session", "send"],
    usage: "trace session send [session-id] <message> [--self] [--json]",
    description: "Send a message to a session",
    async run(ctx) {
      const selfIndex = ctx.args.indexOf("--self");
      const self = selfIndex >= 0;
      const values = ctx.args.slice(2).filter((value) => value !== "--self");
      const id = self ? sessionId(ctx, Number.MAX_SAFE_INTEGER) : values.shift() || sessionId(ctx);
      const text = values.join(" ").trim();
      if (!text) usage("Message text is required");
      const client = await ctx.client();
      const result = await client.graphql<
        { sendSessionMessage: EventView },
        { sessionId: string; text: string; clientMutationId: string }
      >(
        `mutation TraceCliSendSessionMessage($sessionId: ID!, $text: String!, $clientMutationId: String) {
          sendSessionMessage(sessionId: $sessionId, text: $text, clientMutationId: $clientMutationId) {
            ${EVENT_FIELDS}
          }
        }`,
        { sessionId: id, text, clientMutationId: randomUUID() },
      );
      ctx.output(
        { event: result.sendSessionMessage },
        `Sent message (${result.sendSessionMessage.id})`,
      );
    },
  },
  {
    path: ["session", "events"],
    usage: "trace session events [session-id] [--limit N] [--follow] [--json]",
    description: "Read a bounded event snapshot and optionally follow the session stream",
    async run(ctx) {
      let id = "";
      let limit = 50;
      let follow = false;
      for (let index = 2; index < ctx.args.length; index += 1) {
        const value = ctx.args[index];
        if (value === "--limit") {
          limit = Number(ctx.args[++index]);
          if (!Number.isInteger(limit) || limit < 1 || limit > 500) usage("--limit must be 1-500");
        } else if (value === "--follow") follow = true;
        else if (!id) id = value ?? "";
        else usage(`Unexpected argument: ${value}`);
      }
      id ||= ctx.env.TRACE_SESSION_ID || "";
      if (!id) usage("Session ID is required outside a Trace session");
      const client = await ctx.client();
      const organizationId = client.organizationId ?? usage("Organization is required");
      const variables = {
        organizationId,
        scope: { type: "session", id },
        limit,
      };
      const result = await client.graphql<{ events: EventView[] }, typeof variables>(
        `query TraceCliSessionEvents($organizationId: ID!, $scope: ScopeInput!, $limit: Int) {
          events(organizationId: $organizationId, scope: $scope, limit: $limit) { ${EVENT_FIELDS} }
        }`,
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
      await client.subscribe<
        { sessionEvents: EventView },
        { sessionId: string; organizationId: string }
      >(
        `subscription TraceCliFollowSession($sessionId: ID!, $organizationId: ID!) {
          sessionEvents(sessionId: $sessionId, organizationId: $organizationId) { ${EVENT_FIELDS} }
        }`,
        { sessionId: id, organizationId },
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
  },
];
