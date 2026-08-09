import type {
  CodingTool,
  Event,
  HostingMode,
  QueuedMessage,
  Session,
  SessionFilters,
  SessionGroup,
  SessionGroupKind,
  SessionGroupVisibility,
  StartSessionInput,
} from "@trace/gql";
import { randomUUID } from "node:crypto";
import type { TraceClient } from "../client.js";
import { CliError, usage } from "../errors.js";
import type { Command, CommandContext } from "../runtime.js";

type SessionView = Pick<
  Session,
  | "id"
  | "name"
  | "agentStatus"
  | "sessionStatus"
  | "tool"
  | "model"
  | "reasoningEffort"
  | "hosting"
  | "branch"
  | "sessionGroupId"
  | "createdAt"
  | "updatedAt"
> & {
  channel?: { id: string; name: string } | null;
  repo?: { id: string; name: string } | null;
};
type EventView = Pick<
  Event,
  "id" | "eventType" | "scopeType" | "scopeId" | "timestamp" | "payload"
>;
type GroupView = Pick<SessionGroup, "id" | "name" | "status" | "archivedAt">;

const SESSION_FIELDS = `
  id name agentStatus sessionStatus tool model reasoningEffort hosting branch sessionGroupId
  createdAt updatedAt channel { id name } repo { id name }
`;
const EVENT_FIELDS = `id eventType scopeType scopeId timestamp payload`;
const AGENT_STATUSES = ["not_started", "active", "done", "failed", "stopped"] as const;
const CODING_TOOLS = [
  "antigravity",
  "claude_code",
  "codex",
  "cursor_composer",
  "custom",
  "pi",
] as const;
const SESSION_KINDS = ["coding", "design", "design_system", "app", "pdf", "animation"] as const;
const HOSTING_MODES = ["cloud", "local"] as const;
const VISIBILITIES = ["public", "private"] as const;

function optionValue(args: string[], index: number, flag: string): string {
  return args[index + 1] || usage(`${flag} requires a value`);
}

function choice<T extends string>(value: string, choices: readonly T[], flag: string): T {
  return choices.includes(value as T)
    ? (value as T)
    : usage(`${flag} must be one of: ${choices.join(", ")}`);
}

function sessionId(ctx: CommandContext, explicit?: string): string {
  return (
    explicit || ctx.env.TRACE_SESSION_ID || usage("Session ID is required outside a Trace session")
  );
}

function printSession(session: SessionView): string {
  return [
    `${session.name} (${session.id})`,
    `Status: ${session.sessionStatus} / ${session.agentStatus}`,
    `Tool: ${session.tool}${session.model ? ` (${session.model})` : ""}`,
    `Hosting: ${session.hosting}`,
    `Group: ${session.sessionGroupId ?? "none"}`,
    `Channel: ${session.channel?.name ?? "none"}`,
    `Repo: ${session.repo?.name ?? "none"}`,
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

function parseSessionList(args: string[]): SessionFilters {
  const filters: SessionFilters = { includeArchived: false, includeMerged: false };
  for (let index = 2; index < args.length; index += 1) {
    const flag = args[index] ?? "";
    if (flag === "--status") {
      filters.agentStatus = choice(optionValue(args, index, flag), AGENT_STATUSES, flag);
      index += 1;
    } else if (flag === "--tool") {
      filters.tool = choice(optionValue(args, index, flag), CODING_TOOLS, flag);
      index += 1;
    } else if (flag === "--repo") {
      filters.repoId = optionValue(args, index, flag);
      index += 1;
    } else if (flag === "--channel") {
      filters.channelId = optionValue(args, index, flag);
      index += 1;
    } else if (flag === "--limit") {
      const limit = Number(optionValue(args, index, flag));
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) usage("--limit must be 1-500");
      filters.limit = limit;
      index += 1;
    } else if (flag === "--include-archived") filters.includeArchived = true;
    else if (flag === "--include-merged") filters.includeMerged = true;
    else usage(`Unexpected argument: ${flag}`);
  }
  return filters;
}

function parseSessionStart(ctx: CommandContext): StartSessionInput {
  const input: StartSessionInput = {};
  const prompt: string[] = [];
  let requestedGroup = false;
  let requestedDestination = false;
  let requestedGroupConfiguration = false;

  for (let index = 2; index < ctx.args.length; index += 1) {
    const flag = ctx.args[index] ?? "";
    if (flag === "--kind") {
      input.kind = choice(
        optionValue(ctx.args, index, flag),
        SESSION_KINDS,
        flag,
      ) as SessionGroupKind;
      requestedGroupConfiguration = true;
      index += 1;
    } else if (flag === "--tool") {
      input.tool = choice(optionValue(ctx.args, index, flag), CODING_TOOLS, flag) as CodingTool;
      index += 1;
    } else if (flag === "--model") input.model = optionValue(ctx.args, index++, flag);
    else if (flag === "--reasoning") input.reasoningEffort = optionValue(ctx.args, index++, flag);
    else if (flag === "--hosting") {
      input.hosting = choice(
        optionValue(ctx.args, index, flag),
        HOSTING_MODES,
        flag,
      ) as HostingMode;
      requestedGroupConfiguration = true;
      index += 1;
    } else if (flag === "--runtime") {
      input.runtimeInstanceId = optionValue(ctx.args, index++, flag);
      requestedGroupConfiguration = true;
    } else if (flag === "--environment") {
      input.environmentId = optionValue(ctx.args, index++, flag);
      requestedGroupConfiguration = true;
    } else if (flag === "--repo") {
      input.repoId = optionValue(ctx.args, index++, flag);
      requestedDestination = true;
    } else if (flag === "--branch") {
      input.branch = optionValue(ctx.args, index++, flag);
      requestedGroupConfiguration = true;
    } else if (flag === "--channel") {
      input.channelId = optionValue(ctx.args, index++, flag);
      requestedDestination = true;
    } else if (flag === "--group") {
      input.sessionGroupId = optionValue(ctx.args, index++, flag);
      requestedGroup = true;
    } else if (flag === "--project") {
      input.projectId = optionValue(ctx.args, index++, flag);
      requestedDestination = true;
    } else if (flag === "--ticket") input.ticketId = optionValue(ctx.args, index++, flag);
    else if (flag === "--visibility") {
      input.visibility = choice(
        optionValue(ctx.args, index, flag),
        VISIBILITIES,
        flag,
      ) as SessionGroupVisibility;
      requestedGroupConfiguration = true;
      index += 1;
    } else if (flag === "--interaction-mode")
      input.interactionMode = optionValue(ctx.args, index++, flag);
    else if (flag === "--prompt") input.prompt = optionValue(ctx.args, index++, flag);
    else if (flag === "--idempotency-key")
      input.clientMutationId = optionValue(ctx.args, index++, flag);
    else if (flag === "--defer") {
      input.deferRuntimeSelection = true;
      requestedGroupConfiguration = true;
    } else if (flag.startsWith("--")) usage(`Unexpected argument: ${flag}`);
    else prompt.push(flag);
  }

  if (prompt.length) {
    if (input.prompt) usage("Provide the prompt either positionally or with --prompt, not both");
    input.prompt = prompt.join(" ");
  }
  if (requestedGroup && requestedDestination) {
    usage("--group cannot be combined with --channel, --project, or --repo");
  }
  if (requestedGroup && requestedGroupConfiguration) {
    usage(
      "--group cannot be combined with --kind, --hosting, --runtime, --environment, --branch, --visibility, or --defer; sessions inherit those settings from their group",
    );
  }

  input.clientMutationId ||= randomUUID();
  return input;
}

async function resolveStartDefaultsAndDestination(
  client: TraceClient,
  input: StartSessionInput,
  currentSessionId?: string,
): Promise<void> {
  if (input.sessionGroupId) return;

  const hasExplicitDestination = !!input.channelId || !!input.projectId || !!input.repoId;
  const hasExplicitGeneratedKind = !!input.kind && input.kind !== "coding";
  const hasExplicitTool = !!input.tool;
  const hasExplicitRuntimeSelection =
    !!input.environmentId || !!input.runtimeInstanceId || !!input.hosting;

  let impliedRepo: { id: string; name: string } | null = null;
  if (currentSessionId) {
    const result = await client.graphql<
      {
        session: {
          id: string;
          tool: CodingTool;
          model?: string | null;
          reasoningEffort?: string | null;
          hosting: HostingMode;
          channel?: {
            id: string;
            name: string;
            repo?: { id: string; name: string } | null;
          } | null;
          repo?: { id: string; name: string } | null;
          projects: Array<{ id: string }>;
          connection?: {
            environmentId?: string | null;
            runtimeInstanceId?: string | null;
          } | null;
          sessionGroup?: {
            kind: SessionGroupKind;
            visibility: SessionGroupVisibility;
          } | null;
        } | null;
      },
      { id: string }
    >(
      `query TraceCliStartContextSession($id: ID!) {
        session(id: $id) {
          id tool model reasoningEffort hosting
          channel { id name repo { id name } }
          repo { id name }
          projects { id }
          connection { environmentId runtimeInstanceId }
          sessionGroup { kind visibility }
        }
      }`,
      { id: currentSessionId },
    );
    if (!result.session) usage(`Current session not found: ${currentSessionId}`);
    const current = result.session;

    input.kind ??= current.sessionGroup?.kind;
    input.visibility ??= current.sessionGroup?.visibility;
    input.tool ??= current.tool;
    if (!hasExplicitTool) {
      input.model ??= current.model;
      input.reasoningEffort ??= current.reasoningEffort;
    }
    if (!hasExplicitRuntimeSelection && !hasExplicitGeneratedKind) {
      input.hosting ??= current.hosting;
      input.environmentId ??= current.connection?.environmentId;
      if (!input.environmentId && current.hosting === "local") {
        input.runtimeInstanceId ??= current.connection?.runtimeInstanceId;
      }
    }
    if (!hasExplicitDestination && (!input.kind || input.kind === "coding")) {
      input.channelId = current.channel?.id;
      input.repoId = current.repo?.id;
      if (current.projects.length === 1) input.projectId = current.projects[0]?.id;
      impliedRepo = current.channel?.repo ?? current.repo ?? null;
    }
  }

  if (input.kind && input.kind !== "coding") return;
  if (!input.channelId && !input.projectId && !input.repoId) {
    usage("Starting a coding session group requires --channel, --project, or --repo");
  }

  if (input.channelId && !impliedRepo) {
    const result = await client.graphql<
      { channel: { id: string; name: string; repo?: { id: string; name: string } | null } | null },
      { id: string }
    >(`query TraceCliStartChannel($id: ID!) { channel(id: $id) { id name repo { id name } } }`, {
      id: input.channelId,
    });
    if (!result.channel) usage(`Channel not found: ${input.channelId}`);
    impliedRepo = result.channel.repo ?? null;
  } else if (input.projectId && !impliedRepo) {
    const result = await client.graphql<
      { project: { id: string; name: string; repo?: { id: string; name: string } | null } | null },
      { id: string }
    >(`query TraceCliStartProject($id: ID!) { project(id: $id) { id name repo { id name } } }`, {
      id: input.projectId,
    });
    if (!result.project) usage(`Project not found: ${input.projectId}`);
    impliedRepo = result.project.repo ?? null;
  }

  if (impliedRepo && input.repoId && input.repoId !== impliedRepo.id) {
    usage(
      `The selected destination uses repo ${impliedRepo.id} (${impliedRepo.name}); remove --repo or use that repo`,
    );
  }
  input.repoId ??= impliedRepo?.id;
  if (!input.repoId) {
    usage("The selected destination has no repository; add --repo for a coding session");
  }
}

function sessionUiPath(session: SessionView): string | null {
  if (!session.sessionGroupId) return null;
  return session.channel?.id
    ? `/c/${session.channel.id}/g/${session.sessionGroupId}/s/${session.id}`
    : `/g/${session.sessionGroupId}/s/${session.id}`;
}

async function startSessionWithRetry(client: TraceClient, input: StartSessionInput) {
  const request = () =>
    client.graphql<{ startSession: SessionView }, { input: StartSessionInput }>(
      `mutation TraceCliStartSession($input: StartSessionInput!) { startSession(input: $input) { ${SESSION_FIELDS} } }`,
      { input },
    );
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof CliError) || !["connectivity", "server"].includes(error.category)) {
      throw error;
    }
    try {
      return await request();
    } catch (retryError) {
      if (retryError instanceof CliError) {
        throw new CliError(
          `${retryError.message}; retry with --idempotency-key ${input.clientMutationId}`,
          retryError.exitCode,
          retryError.category,
        );
      }
      throw retryError;
    }
  }
}

function parseTargetAction(ctx: CommandContext): {
  id: string;
  values: string[];
  queue: boolean;
  interactionMode?: string;
} {
  const values: string[] = [];
  let self = false;
  let queue = false;
  let interactionMode: string | undefined;
  for (let index = 2; index < ctx.args.length; index += 1) {
    const value = ctx.args[index] ?? "";
    if (value === "--self") self = true;
    else if (value === "--queue") queue = true;
    else if (value === "--interaction-mode")
      interactionMode = optionValue(ctx.args, index++, value);
    else values.push(value);
  }
  const id = self ? sessionId(ctx) : sessionId(ctx, values.shift());
  return { id, values, queue, interactionMode };
}

export const sessionCommands: Command[] = [
  {
    path: ["session", "list"],
    usage:
      "trace session list [--status STATUS] [--tool TOOL] [--repo ID] [--channel ID] [--limit N] [--include-archived] [--include-merged] [--json]",
    description: "List sessions visible to the session owner",
    async run(ctx) {
      const client = await ctx.client();
      const variables = {
        organizationId: client.organizationId!,
        filters: parseSessionList(ctx.args),
      };
      const result = await client.graphql<{ sessions: SessionView[] }, typeof variables>(
        `query TraceCliSessions($organizationId: ID!, $filters: SessionFilters) {
          sessions(organizationId: $organizationId, filters: $filters) { ${SESSION_FIELDS} }
        }`,
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
  },
  {
    path: ["session", "get"],
    usage: "trace session get [session-id] [--json]",
    description: "Get a session, defaulting to TRACE_SESSION_ID",
    async run(ctx) {
      if (ctx.args[3]) usage(`Unexpected argument: ${ctx.args[3]}`);
      const session = await getSession(ctx, sessionId(ctx, ctx.args[2]));
      ctx.output({ session }, printSession(session));
    },
  },
  {
    path: ["session", "start"],
    usage:
      "trace session start [prompt] [--group ID | --channel ID | --project ID | --repo ID] [--tool TOOL] [--model MODEL] [--hosting MODE] [--runtime ID] [--environment ID] [--branch NAME] [--ticket ID] [--kind KIND] [--visibility VISIBILITY] [--interaction-mode MODE] [--defer] [--idempotency-key KEY] [--json]",
    description: "Start a new session group or add a session to an explicit group",
    async run(ctx) {
      const client = await ctx.client();
      const input = parseSessionStart(ctx);
      await resolveStartDefaultsAndDestination(client, input, ctx.env.TRACE_SESSION_ID);
      const result = await startSessionWithRetry(client, input);
      const runRequested = !!input.prompt;
      const uiPath = sessionUiPath(result.startSession);
      ctx.output(
        {
          session: result.startSession,
          runRequested,
          uiPath,
          idempotencyKey: input.clientMutationId,
        },
        [
          printSession(result.startSession),
          runRequested
            ? "Initial run requested; not_started may be shown while the runtime is provisioning."
            : "Session created without an initial run.",
          ...(uiPath ? [`Open: ${uiPath}`] : []),
        ].join("\n"),
      );
    },
  },
  {
    path: ["session", "send"],
    usage:
      "trace session send [session-id] <message> [--self] [--queue] [--interaction-mode MODE] [--json]",
    description: "Send or queue a message for a session",
    async run(ctx) {
      const { id, values, queue, interactionMode } = parseTargetAction(ctx);
      const text = values.join(" ").trim();
      if (!text) usage("Message text is required");
      const client = await ctx.client();
      if (queue) {
        const variables = { sessionId: id, text, interactionMode: interactionMode ?? null };
        const result = await client.graphql<
          { queueSessionMessage: QueuedMessage },
          typeof variables
        >(
          `mutation TraceCliQueueSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
            queueSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) { id sessionId text position createdAt }
          }`,
          variables,
        );
        ctx.output(
          { queuedMessage: result.queueSessionMessage },
          `Queued message (${result.queueSessionMessage.id})`,
        );
        return;
      }
      const variables = {
        sessionId: id,
        text,
        interactionMode: interactionMode ?? null,
        clientMutationId: randomUUID(),
      };
      const result = await client.graphql<{ sendSessionMessage: EventView }, typeof variables>(
        `mutation TraceCliSendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String, $clientMutationId: String) {
          sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode, clientMutationId: $clientMutationId) { ${EVENT_FIELDS} }
        }`,
        variables,
      );
      ctx.output(
        { event: result.sendSessionMessage },
        `Sent message (${result.sendSessionMessage.id})`,
      );
    },
  },
  {
    path: ["session", "run"],
    usage: "trace session run [session-id] [prompt] [--self] [--interaction-mode MODE] [--json]",
    description: "Start or resume a session run",
    async run(ctx) {
      const { id, values, interactionMode } = parseTargetAction(ctx);
      const variables = {
        id,
        prompt: values.join(" ").trim() || null,
        interactionMode: interactionMode ?? null,
      };
      const client = await ctx.client();
      const result = await client.graphql<{ runSession: SessionView }, typeof variables>(
        `mutation TraceCliRunSession($id: ID!, $prompt: String, $interactionMode: String) { runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) { ${SESSION_FIELDS} } }`,
        variables,
      );
      ctx.output({ session: result.runSession }, printSession(result.runSession));
    },
  },
  {
    path: ["session", "stop"],
    usage: "trace session stop [session-id] [--self] [--json]",
    description: "Stop a running session",
    async run(ctx) {
      const { id, values } = parseTargetAction(ctx);
      if (values.length) usage(`Unexpected argument: ${values[0]}`);
      const client = await ctx.client();
      const result = await client.graphql<{ terminateSession: SessionView }, { id: string }>(
        `mutation TraceCliStopSession($id: ID!) { terminateSession(id: $id) { ${SESSION_FIELDS} } }`,
        { id },
      );
      ctx.output({ session: result.terminateSession }, printSession(result.terminateSession));
    },
  },
  {
    path: ["session", "archive"],
    usage: "trace session archive [session-id] [--self] [--json]",
    description: "Archive a session's group",
    async run(ctx) {
      const { id, values } = parseTargetAction(ctx);
      if (values.length) usage(`Unexpected argument: ${values[0]}`);
      const session = await getSession(ctx, id);
      if (!session.sessionGroupId) usage("This session has no group to archive");
      const client = await ctx.client();
      const result = await client.graphql<
        { archiveSessionGroup: GroupView | null },
        { id: string }
      >(
        `mutation TraceCliArchiveSession($id: ID!) { archiveSessionGroup(id: $id) { id name status archivedAt } }`,
        { id: session.sessionGroupId },
      );
      ctx.output(
        { sessionGroup: result.archiveSessionGroup },
        `Archived session group (${session.sessionGroupId})`,
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
      id = sessionId(ctx, id);
      const client = await ctx.client();
      const organizationId = client.organizationId ?? usage("Organization is required");
      const variables = {
        organizationId,
        scope: { type: "session", id },
        limit,
        before: "9999-12-31T23:59:59.999Z",
      };
      const result = await client.graphql<{ events: EventView[] }, typeof variables>(
        `query TraceCliSessionEvents($organizationId: ID!, $scope: ScopeInput!, $limit: Int, $before: DateTime) { events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) { ${EVENT_FIELDS} } }`,
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
        `subscription TraceCliFollowSession($sessionId: ID!, $organizationId: ID!, $after: DateTime, $afterEventId: ID) { sessionEvents(sessionId: $sessionId, organizationId: $organizationId, after: $after, afterEventId: $afterEventId) { ${EVENT_FIELDS} } }`,
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
  },
];
