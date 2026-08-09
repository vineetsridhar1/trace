#!/usr/bin/env node

// src/commands/artifact.ts
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// src/errors.ts
var ExitCode = {
  success: 0,
  authentication: 2,
  authorization: 3,
  validation: 4,
  connectivity: 5,
  server: 6,
  usage: 64
};
var CliError = class extends Error {
  constructor(message, exitCode, category) {
    super(message);
    this.exitCode = exitCode;
    this.category = category;
    this.name = "CliError";
  }
};
function usage(message) {
  throw new CliError(message, ExitCode.usage, "usage");
}

// src/commands/artifact.ts
var artifactCommand = {
  path: ["artifact", "push"],
  usage: "trace artifact push <type> <file-or-directory> [--key KEY] [--json]",
  description: "Upload an immutable artifact from an active Trace invocation",
  async run(ctx) {
    const type = ctx.args[2] || usage("Artifact type is required");
    const sourceArg = ctx.args[3] || usage("Artifact file or directory is required");
    const source = resolve(sourceArg);
    let key = type === "visual-plan" || type === "trace.visual-plan.v1" ? "primary" : "default";
    for (let index = 4; index < ctx.args.length; index += 1) {
      if (ctx.args[index] !== "--key") usage(`Unknown option: ${ctx.args[index]}`);
      key = ctx.args[++index] || usage("--key requires a value");
    }
    if (!existsSync(source)) usage(`Path does not exist: ${source}`);
    const apiUrl = ctx.env.TRACE_API_URL || ctx.env.TRACE_SERVER_URL;
    const token = ctx.env.TRACE_INVOCATION_TOKEN;
    if (!apiUrl || !token) {
      throw new CliError(
        "This command is only available inside an active Trace session",
        ExitCode.authentication,
        "authentication"
      );
    }
    if (type === "video" || type === "trace.video.v1") {
      if (!statSync(source).isFile()) usage("Video artifacts require one video file");
      const validator = ctx.env.TRACE_BROWSER_VIDEO_VALIDATE;
      if (!validator) usage("Browser video validation is unavailable");
      const validated = spawnSync(validator, [source], { stdio: "inherit", env: ctx.env });
      if (validated.status !== 0) {
        throw new CliError(
          "video validation failed; artifact was not uploaded",
          1,
          "validation"
        );
      }
    }
    const temporary = mkdtempSync(join(tmpdir(), "trace-artifact-"));
    const archivePath = join(temporary, "artifact.tar.gz");
    try {
      const sourceStat = statSync(source);
      const tarArgs = sourceStat.isDirectory() ? ["-czf", archivePath, "-C", source, "."] : ["-czf", archivePath, "-C", dirname(source), basename(source)];
      const packed = spawnSync("tar", tarArgs, {
        stdio: "inherit",
        env: { ...ctx.env, COPYFILE_DISABLE: "1" }
      });
      if (packed.status !== 0) usage("Could not package artifact");
      let response;
      try {
        response = await fetch(new URL("/agent/artifacts", apiUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/gzip",
            "X-Trace-Artifact-Type": type,
            "X-Trace-Artifact-Key": key,
            "X-Trace-Idempotency-Key": randomUUID()
          },
          body: readFileSync(archivePath)
        });
      } catch {
        throw new CliError("Could not connect to Trace", ExitCode.connectivity, "connectivity");
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.artifact?.id !== "string") {
        throw new CliError(
          typeof result.error === "string" ? result.error : "Artifact upload failed",
          response.status === 401 ? ExitCode.authentication : ExitCode.server,
          response.status === 401 ? "authentication" : "server"
        );
      }
      ctx.output({ artifact: { id: result.artifact.id, type, key } }, result.artifact.id);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
};

// src/commands/context.ts
var contextCommand = {
  path: ["context"],
  usage: "trace context [--json]",
  description: "Show the selected Trace server, organization, and session context",
  async run(ctx) {
    const value = {
      serverUrl: ctx.env.TRACE_API_URL || ctx.env.TRACE_SERVER_URL || null,
      organizationId: ctx.env.TRACE_ORGANIZATION_ID || null,
      sessionId: ctx.env.TRACE_SESSION_ID || null,
      sessionGroupId: ctx.env.TRACE_SESSION_GROUP_ID || null,
      authentication: ctx.env.TRACE_INVOCATION_TOKEN ? "session" : "missing"
    };
    ctx.output(
      value,
      [
        `Server: ${value.serverUrl}`,
        `Organization: ${value.organizationId ?? "none"}`,
        `Session: ${value.sessionId ?? "none"}`,
        `Session group: ${value.sessionGroupId ?? "none"}`,
        `Authentication: ${value.authentication}`
      ].join("\n")
    );
  }
};

// src/commands/resources.ts
function organizationId(value) {
  return value || usage("The Trace organization is unavailable in this session");
}
var resourceCommands = [
  {
    path: ["channel", "list"],
    usage: "trace channel list [--member-only] [--json]",
    description: "List channels available to the session owner",
    async run(ctx) {
      const unexpected = ctx.args.slice(2).find((value) => value !== "--member-only");
      if (unexpected) usage(`Unexpected argument: ${unexpected}`);
      const client = await ctx.client();
      const variables = {
        organizationId: organizationId(client.organizationId),
        memberOnly: ctx.args.includes("--member-only")
      };
      const result = await client.graphql(
        `query TraceCliChannels($organizationId: ID!, $memberOnly: Boolean) {
          channels(organizationId: $organizationId, memberOnly: $memberOnly) {
            id name type visibility baseBranch viewerIsMember
            repo { id name }
            projects { id name }
          }
        }`,
        variables
      );
      ctx.output(
        { channels: result.channels },
        result.channels.length ? result.channels.map(
          (channel) => `${channel.id}	${channel.name}	${channel.visibility}	${channel.repo?.name ?? "no repo"}`
        ).join("\n") : "No channels found"
      );
    }
  },
  {
    path: ["repo", "list"],
    usage: "trace repo list [--json]",
    description: "List repositories in the current organization",
    async run(ctx) {
      if (ctx.args[2]) usage(`Unexpected argument: ${ctx.args[2]}`);
      const client = await ctx.client();
      const variables = { organizationId: organizationId(client.organizationId) };
      const result = await client.graphql(
        `query TraceCliRepos($organizationId: ID!) {
          repos(organizationId: $organizationId) { id name provider remoteUrl defaultBranch }
        }`,
        variables
      );
      ctx.output(
        { repos: result.repos },
        result.repos.length ? result.repos.map((repo) => `${repo.id}	${repo.name}	${repo.provider}	${repo.defaultBranch}`).join("\n") : "No repositories found"
      );
    }
  },
  {
    path: ["project", "list"],
    usage: "trace project list [--repo ID] [--json]",
    description: "List projects in the current organization",
    async run(ctx) {
      let repoId;
      for (let index = 2; index < ctx.args.length; index += 1) {
        const value = ctx.args[index];
        if (value === "--repo") repoId = ctx.args[++index] || usage("--repo requires an ID");
        else usage(`Unexpected argument: ${value}`);
      }
      const client = await ctx.client();
      const variables = {
        organizationId: organizationId(client.organizationId),
        repoId: repoId ?? null
      };
      const result = await client.graphql(
        `query TraceCliProjects($organizationId: ID!, $repoId: ID) {
          projects(organizationId: $organizationId, repoId: $repoId) { id name repo { id name } }
        }`,
        variables
      );
      ctx.output(
        { projects: result.projects },
        result.projects.length ? result.projects.map((project) => `${project.id}	${project.name}	${project.repo?.name ?? "no repo"}`).join("\n") : "No projects found"
      );
    }
  }
];

// src/commands/session.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var SESSION_FIELDS = `
  id name agentStatus sessionStatus tool model reasoningEffort hosting branch sessionGroupId
  createdAt updatedAt channel { id name } repo { id name }
`;
var EVENT_FIELDS = `id eventType scopeType scopeId timestamp payload`;
var AGENT_STATUSES = ["not_started", "active", "done", "failed", "stopped"];
var CODING_TOOLS = ["antigravity", "claude_code", "codex", "cursor_composer", "custom", "pi"];
var SESSION_KINDS = ["coding", "design", "design_system", "app", "pdf", "animation"];
var HOSTING_MODES = ["cloud", "local"];
var VISIBILITIES = ["public", "private"];
function optionValue(args, index, flag) {
  return args[index + 1] || usage(`${flag} requires a value`);
}
function choice(value, choices, flag) {
  return choices.includes(value) ? value : usage(`${flag} must be one of: ${choices.join(", ")}`);
}
function sessionId(ctx, explicit) {
  return explicit || ctx.env.TRACE_SESSION_ID || usage("Session ID is required outside a Trace session");
}
function printSession(session) {
  return [
    `${session.name} (${session.id})`,
    `Status: ${session.sessionStatus} / ${session.agentStatus}`,
    `Tool: ${session.tool}${session.model ? ` (${session.model})` : ""}`,
    `Hosting: ${session.hosting}`,
    `Group: ${session.sessionGroupId ?? "none"}`,
    `Channel: ${session.channel?.name ?? "none"}`,
    `Repo: ${session.repo?.name ?? "none"}`,
    ...session.branch ? [`Branch: ${session.branch}`] : []
  ].join("\n");
}
async function getSession(ctx, id) {
  const client = await ctx.client();
  const result = await client.graphql(
    `query TraceCliSession($id: ID!) { session(id: $id) { ${SESSION_FIELDS} } }`,
    { id }
  );
  if (!result.session) usage(`Session not found: ${id}`);
  return result.session;
}
function parseSessionList(args) {
  const filters = { includeArchived: false, includeMerged: false };
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
function parseSessionStart(ctx) {
  const input = {};
  const prompt = [];
  let hasExplicitDestination = false;
  for (let index = 2; index < ctx.args.length; index += 1) {
    const flag = ctx.args[index] ?? "";
    if (flag === "--kind") {
      input.kind = choice(optionValue(ctx.args, index, flag), SESSION_KINDS, flag);
      hasExplicitDestination = true;
      index += 1;
    } else if (flag === "--tool") {
      input.tool = choice(optionValue(ctx.args, index, flag), CODING_TOOLS, flag);
      index += 1;
    } else if (flag === "--model") input.model = optionValue(ctx.args, index++, flag);
    else if (flag === "--reasoning") input.reasoningEffort = optionValue(ctx.args, index++, flag);
    else if (flag === "--hosting") {
      input.hosting = choice(optionValue(ctx.args, index, flag), HOSTING_MODES, flag);
      hasExplicitDestination = true;
      index += 1;
    } else if (flag === "--runtime") {
      input.runtimeInstanceId = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--repo") {
      input.repoId = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--branch") {
      input.branch = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--channel") {
      input.channelId = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--group") {
      input.sessionGroupId = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--project") {
      input.projectId = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--ticket") {
      input.ticketId = optionValue(ctx.args, index++, flag);
      hasExplicitDestination = true;
    } else if (flag === "--visibility") {
      input.visibility = choice(optionValue(ctx.args, index, flag), VISIBILITIES, flag);
      hasExplicitDestination = true;
      index += 1;
    } else if (flag === "--interaction-mode") input.interactionMode = optionValue(ctx.args, index++, flag);
    else if (flag === "--prompt") input.prompt = optionValue(ctx.args, index++, flag);
    else if (flag === "--defer") {
      input.deferRuntimeSelection = true;
      hasExplicitDestination = true;
    } else if (flag.startsWith("--")) usage(`Unexpected argument: ${flag}`);
    else prompt.push(flag);
  }
  if (prompt.length) {
    if (input.prompt) usage("Provide the prompt either positionally or with --prompt, not both");
    input.prompt = prompt.join(" ");
  }
  if (input.sessionGroupId && (input.kind || input.hosting || input.runtimeInstanceId || input.branch || input.visibility || input.deferRuntimeSelection)) {
    usage(
      "--group cannot be combined with --kind, --hosting, --runtime, --branch, --visibility, or --defer; sessions inherit those settings from their group"
    );
  }
  if (!hasExplicitDestination && ctx.env.TRACE_SESSION_GROUP_ID) {
    input.sessionGroupId = ctx.env.TRACE_SESSION_GROUP_ID;
  }
  return input;
}
function parseTargetAction(ctx) {
  const values = [];
  let self = false;
  let queue = false;
  let interactionMode;
  for (let index = 2; index < ctx.args.length; index += 1) {
    const value = ctx.args[index] ?? "";
    if (value === "--self") self = true;
    else if (value === "--queue") queue = true;
    else if (value === "--interaction-mode") interactionMode = optionValue(ctx.args, index++, value);
    else values.push(value);
  }
  const id = self ? sessionId(ctx) : sessionId(ctx, values.shift());
  return { id, values, queue, interactionMode };
}
var sessionCommands = [
  {
    path: ["session", "list"],
    usage: "trace session list [--status STATUS] [--tool TOOL] [--repo ID] [--channel ID] [--limit N] [--include-archived] [--include-merged] [--json]",
    description: "List sessions visible to the session owner",
    async run(ctx) {
      const client = await ctx.client();
      const variables = { organizationId: client.organizationId, filters: parseSessionList(ctx.args) };
      const result = await client.graphql(
        `query TraceCliSessions($organizationId: ID!, $filters: SessionFilters) {
          sessions(organizationId: $organizationId, filters: $filters) { ${SESSION_FIELDS} }
        }`,
        variables
      );
      ctx.output(
        { sessions: result.sessions },
        result.sessions.length ? result.sessions.map((session) => `${session.id}	${session.name}	${session.agentStatus}	${session.tool}`).join("\n") : "No sessions found"
      );
    }
  },
  {
    path: ["session", "get"],
    usage: "trace session get [session-id] [--json]",
    description: "Get a session, defaulting to TRACE_SESSION_ID",
    async run(ctx) {
      if (ctx.args[3]) usage(`Unexpected argument: ${ctx.args[3]}`);
      const session = await getSession(ctx, sessionId(ctx, ctx.args[2]));
      ctx.output({ session }, printSession(session));
    }
  },
  {
    path: ["session", "start"],
    usage: "trace session start [prompt] [--tool TOOL] [--model MODEL] [--hosting MODE] [--runtime ID] [--repo ID] [--branch NAME] [--channel ID] [--group ID] [--project ID] [--ticket ID] [--kind KIND] [--visibility VISIBILITY] [--interaction-mode MODE] [--defer] [--json]",
    description: "Start a sibling session or create one in an explicit Trace destination",
    async run(ctx) {
      const client = await ctx.client();
      const input = parseSessionStart(ctx);
      const result = await client.graphql(
        `mutation TraceCliStartSession($input: StartSessionInput!) { startSession(input: $input) { ${SESSION_FIELDS} } }`,
        { input }
      );
      ctx.output({ session: result.startSession }, printSession(result.startSession));
    }
  },
  {
    path: ["session", "send"],
    usage: "trace session send [session-id] <message> [--self] [--queue] [--interaction-mode MODE] [--json]",
    description: "Send or queue a message for a session",
    async run(ctx) {
      const { id, values, queue, interactionMode } = parseTargetAction(ctx);
      const text = values.join(" ").trim();
      if (!text) usage("Message text is required");
      const client = await ctx.client();
      if (queue) {
        const variables2 = { sessionId: id, text, interactionMode: interactionMode ?? null };
        const result2 = await client.graphql(
          `mutation TraceCliQueueSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
            queueSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) { id sessionId text position createdAt }
          }`,
          variables2
        );
        ctx.output({ queuedMessage: result2.queueSessionMessage }, `Queued message (${result2.queueSessionMessage.id})`);
        return;
      }
      const variables = { sessionId: id, text, interactionMode: interactionMode ?? null, clientMutationId: randomUUID2() };
      const result = await client.graphql(
        `mutation TraceCliSendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String, $clientMutationId: String) {
          sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode, clientMutationId: $clientMutationId) { ${EVENT_FIELDS} }
        }`,
        variables
      );
      ctx.output({ event: result.sendSessionMessage }, `Sent message (${result.sendSessionMessage.id})`);
    }
  },
  {
    path: ["session", "run"],
    usage: "trace session run [session-id] [prompt] [--self] [--interaction-mode MODE] [--json]",
    description: "Start or resume a session run",
    async run(ctx) {
      const { id, values, interactionMode } = parseTargetAction(ctx);
      const variables = { id, prompt: values.join(" ").trim() || null, interactionMode: interactionMode ?? null };
      const client = await ctx.client();
      const result = await client.graphql(
        `mutation TraceCliRunSession($id: ID!, $prompt: String, $interactionMode: String) { runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) { ${SESSION_FIELDS} } }`,
        variables
      );
      ctx.output({ session: result.runSession }, printSession(result.runSession));
    }
  },
  {
    path: ["session", "stop"],
    usage: "trace session stop [session-id] [--self] [--json]",
    description: "Stop a running session",
    async run(ctx) {
      const { id, values } = parseTargetAction(ctx);
      if (values.length) usage(`Unexpected argument: ${values[0]}`);
      const client = await ctx.client();
      const result = await client.graphql(
        `mutation TraceCliStopSession($id: ID!) { terminateSession(id: $id) { ${SESSION_FIELDS} } }`,
        { id }
      );
      ctx.output({ session: result.terminateSession }, printSession(result.terminateSession));
    }
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
      const result = await client.graphql(
        `mutation TraceCliArchiveSession($id: ID!) { archiveSessionGroup(id: $id) { id name status archivedAt } }`,
        { id: session.sessionGroupId }
      );
      ctx.output({ sessionGroup: result.archiveSessionGroup }, `Archived session group (${session.sessionGroupId})`);
    }
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
      const organizationId2 = client.organizationId ?? usage("Organization is required");
      const variables = { organizationId: organizationId2, scope: { type: "session", id }, limit };
      const result = await client.graphql(
        `query TraceCliSessionEvents($organizationId: ID!, $scope: ScopeInput!, $limit: Int) { events(organizationId: $organizationId, scope: $scope, limit: $limit) { ${EVENT_FIELDS} } }`,
        variables
      );
      ctx.output(
        { events: result.events, following: follow },
        result.events.length ? result.events.map((event) => `${event.timestamp}	${event.eventType}	${event.id}`).join("\n") : "No events found"
      );
      if (!follow) return;
      await client.subscribe(
        `subscription TraceCliFollowSession($sessionId: ID!, $organizationId: ID!) { sessionEvents(sessionId: $sessionId, organizationId: $organizationId) { ${EVENT_FIELDS} } }`,
        { sessionId: id, organizationId: organizationId2 },
        (data) => {
          const event = data.sessionEvents;
          process.stdout.write(ctx.options.json ? `${JSON.stringify({ event })}
` : `${event.timestamp}	${event.eventType}	${event.id}
`);
        }
      );
    }
  }
];

// src/client.ts
function errorFromStatus(status, message) {
  if (status === 401) return new CliError(message, ExitCode.authentication, "authentication");
  if (status === 403) return new CliError(message, ExitCode.authorization, "authorization");
  if (status >= 400 && status < 500) {
    return new CliError(message, ExitCode.validation, "validation");
  }
  return new CliError(message, ExitCode.server, "server");
}
function graphQlError(error) {
  const message = typeof error.message === "string" ? error.message : "GraphQL request failed";
  const code = error.extensions?.code;
  if (code === "UNAUTHENTICATED") {
    return new CliError(message, ExitCode.authentication, "authentication");
  }
  if (code === "FORBIDDEN") {
    return new CliError(message, ExitCode.authorization, "authorization");
  }
  if (code === "BAD_USER_INPUT" || code === "NOT_FOUND") {
    return new CliError(message, ExitCode.validation, "validation");
  }
  return new CliError(message, ExitCode.server, "server");
}
var TraceClient = class {
  constructor(serverUrl, token, organizationId2) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.organizationId = organizationId2;
  }
  headers(extra) {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "X-Trace-Client-Source": "cli",
      ...this.organizationId ? { "X-Organization-Id": this.organizationId } : {},
      ...extra
    };
  }
  async http(path, init = {}) {
    let response;
    try {
      response = await fetch(new URL(path, this.serverUrl), {
        method: init.method ?? "GET",
        headers: this.headers(),
        body: init.body === void 0 ? void 0 : JSON.stringify(init.body)
      });
    } catch {
      throw new CliError(
        `Could not connect to ${this.serverUrl}`,
        ExitCode.connectivity,
        "connectivity"
      );
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw errorFromStatus(
        response.status,
        typeof payload.error === "string" ? payload.error : `Server returned ${response.status}`
      );
    }
    return payload;
  }
  async graphql(query, variables) {
    let response;
    try {
      response = await fetch(new URL("/graphql", this.serverUrl), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ query, variables })
      });
    } catch {
      throw new CliError(
        `Could not connect to ${this.serverUrl}`,
        ExitCode.connectivity,
        "connectivity"
      );
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw errorFromStatus(response.status, `Server returned ${response.status}`);
    }
    if (payload.errors?.length) throw graphQlError(payload.errors[0] ?? {});
    if (!payload.data) throw new CliError("Server returned no data", ExitCode.server, "server");
    return payload.data;
  }
  async subscribe(query, variables, onData) {
    const url = new URL("/graphql", this.serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, "graphql-transport-ws");
    await new Promise((resolve2, reject) => {
      let subscribed = false;
      const close = () => socket.close(1e3, "CLI stopped following");
      process.once("SIGINT", close);
      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "connection_init",
            payload: {
              token: this.token,
              organizationId: this.organizationId,
              clientSource: "cli"
            }
          })
        );
      });
      socket.addEventListener("message", (message) => {
        let payload;
        try {
          payload = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (payload.type === "connection_ack" && !subscribed) {
          subscribed = true;
          socket.send(
            JSON.stringify({ id: "trace-cli", type: "subscribe", payload: { query, variables } })
          );
        } else if (payload.type === "next" && payload.payload?.data) {
          onData(payload.payload.data);
        } else if (payload.type === "error") {
          reject(graphQlError(payload.payload?.errors?.[0] ?? {}));
          socket.close();
        }
      });
      socket.addEventListener("error", () => {
        reject(
          new CliError(`Could not connect to ${url.origin}`, ExitCode.connectivity, "connectivity")
        );
      });
      socket.addEventListener("close", () => {
        process.removeListener("SIGINT", close);
        resolve2();
      });
    });
  }
};

// src/runtime.ts
function parseGlobalOptions(argv) {
  const args = [];
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") options.json = true;
    else args.push(value ?? "");
  }
  return { args, options };
}
async function createCommandContext(argv, env = process.env) {
  const parsed = parseGlobalOptions(argv);
  return {
    args: parsed.args,
    options: parsed.options,
    env,
    output(value, human) {
      process.stdout.write(parsed.options.json ? `${JSON.stringify(value)}
` : `${human}
`);
    },
    async client(requireOrganization = true) {
      const token = env.TRACE_INVOCATION_TOKEN;
      if (!token) {
        throw new CliError(
          "This command is only available inside an active Trace AI session",
          ExitCode.authentication,
          "authentication"
        );
      }
      const serverUrl = env.TRACE_API_URL || env.TRACE_SERVER_URL;
      if (!serverUrl) {
        throw new CliError(
          "The Trace server URL is unavailable in this session",
          ExitCode.authentication,
          "authentication"
        );
      }
      const organizationId2 = env.TRACE_ORGANIZATION_ID;
      if (requireOrganization && !organizationId2) {
        throw new CliError(
          "The Trace organization is unavailable in this session",
          ExitCode.authentication,
          "authentication"
        );
      }
      return new TraceClient(serverUrl, token, organizationId2);
    }
  };
}

// src/main.ts
var commands = [
  contextCommand,
  ...resourceCommands,
  ...sessionCommands,
  artifactCommand
];
function help(command) {
  if (command) return [`Usage: ${command.usage}`, "", command.description].join("\n");
  return [
    "Usage: trace <command> [options]",
    "",
    "Commands:",
    ...commands.map((command2) => `  ${command2.path.join(" ").padEnd(22)} ${command2.description}`),
    "",
    "Global option: --json",
    "",
    "This command is available inside Trace-managed AI sessions."
  ].join("\n");
}
async function run(argv = process.argv.slice(2)) {
  const wantsJson = argv.includes("--json");
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  if (argv.length === 0 || wantsHelp) {
    const helpArgs = argv.filter((value) => value !== "--help" && value !== "-h");
    const command = commands.find(
      (candidate) => candidate.path.every((part, index) => helpArgs[index] === part)
    );
    process.stdout.write(`${help(command)}
`);
    return ExitCode.success;
  }
  try {
    const ctx = await createCommandContext(argv);
    const command = commands.find(
      (candidate) => candidate.path.every((part, index) => ctx.args[index] === part)
    );
    if (!command)
      throw new CliError(
        `Unknown command: ${ctx.args.slice(0, 2).join(" ")}`,
        ExitCode.usage,
        "usage"
      );
    await command.run(ctx);
    return ExitCode.success;
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError(
      error instanceof Error ? error.message : "Unknown error",
      ExitCode.server,
      "server"
    );
    const value = { error: { category: cliError.category, message: cliError.message } };
    process.stderr.write(wantsJson ? `${JSON.stringify(value)}
` : `trace: ${cliError.message}
`);
    return cliError.exitCode;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
export {
  commands,
  run
};
