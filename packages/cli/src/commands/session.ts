import type { Event, Session, StartSessionInput } from "@trace/gql";
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
    path: ["session", "list"],
    usage: "trace session list [--org ID] [--json]",
    description: "List sessions in an organization",
    async run(ctx) {
      const client = await ctx.client();
      const organizationId = client.organizationId ?? usage("Organization is required");
      const result = await client.graphql<{ sessions: SessionView[] }, { organizationId: string }>(
        `query TraceCliSessions($organizationId: ID!) {
          sessions(organizationId: $organizationId) { ${SESSION_FIELDS} }
        }`,
        { organizationId },
      );
      ctx.output(
        { sessions: result.sessions },
        result.sessions.length
          ? result.sessions
              .map((session) => `${session.id}\t${session.agentStatus}\t${session.name}`)
              .join("\n")
          : "No sessions found",
      );
    },
  },
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
    path: ["session", "start"],
    usage: "trace session start [prompt] [--channel ID|--group ID|--repo ID] [--json]",
    description: "Start a session through the existing Trace session service",
    async run(ctx) {
      const input: StartSessionInput = {};
      const promptParts: string[] = [];
      for (let index = 2; index < ctx.args.length; index += 1) {
        const value = ctx.args[index];
        if (value === "--channel")
          input.channelId = ctx.args[++index] || usage("--channel requires an ID");
        else if (value === "--group")
          input.sessionGroupId = ctx.args[++index] || usage("--group requires an ID");
        else if (value === "--repo")
          input.repoId = ctx.args[++index] || usage("--repo requires an ID");
        else promptParts.push(value ?? "");
      }
      if (promptParts.length) input.prompt = promptParts.join(" ");
      const client = await ctx.client();
      const result = await client.graphql<
        { startSession: SessionView },
        { input: StartSessionInput }
      >(
        `mutation TraceCliStartSession($input: StartSessionInput!) {
          startSession(input: $input) { ${SESSION_FIELDS} }
        }`,
        { input },
      );
      ctx.output({ session: result.startSession }, printSession(result.startSession));
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
    path: ["session", "run"],
    usage: "trace session run [session-id] [prompt] [--json]",
    description: "Run or resume a session",
    async run(ctx) {
      const id = sessionId(ctx);
      const prompt = ctx.args.slice(3).join(" ").trim() || null;
      const client = await ctx.client();
      const result = await client.graphql<
        { runSession: SessionView },
        { id: string; prompt: string | null }
      >(
        `mutation TraceCliRunSession($id: ID!, $prompt: String) {
          runSession(id: $id, prompt: $prompt) { ${SESSION_FIELDS} }
        }`,
        { id, prompt },
      );
      ctx.output({ session: result.runSession }, printSession(result.runSession));
    },
  },
  {
    path: ["session", "stop"],
    usage: "trace session stop [session-id] [--json]",
    description: "Stop a running session",
    async run(ctx) {
      const id = sessionId(ctx);
      const client = await ctx.client();
      const result = await client.graphql<{ terminateSession: SessionView }, { id: string }>(
        `mutation TraceCliStopSession($id: ID!) {
          terminateSession(id: $id) { ${SESSION_FIELDS} }
        }`,
        { id },
      );
      ctx.output({ session: result.terminateSession }, printSession(result.terminateSession));
    },
  },
  {
    path: ["session", "archive"],
    usage: "trace session archive [session-id] [--json]",
    description: "Archive the session's group",
    async run(ctx) {
      const session = await getSession(ctx, sessionId(ctx));
      const groupId = session.sessionGroupId || usage("Session has no group to archive");
      const client = await ctx.client();
      const result = await client.graphql<
        { archiveSessionGroup: { id: string; archived: boolean } | null },
        { id: string }
      >(
        `mutation TraceCliArchiveSession($id: ID!) {
          archiveSessionGroup(id: $id) { id archived }
        }`,
        { id: groupId },
      );
      ctx.output({ sessionGroup: result.archiveSessionGroup }, `Archived session group ${groupId}`);
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
