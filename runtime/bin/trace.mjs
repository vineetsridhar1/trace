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
      serverUrl: ctx.env.TRACE_SERVER_URL || ctx.env.TRACE_API_URL || null,
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

// src/commands/session.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var SESSION_FIELDS = `
  id name agentStatus sessionStatus tool model hosting branch sessionGroupId createdAt updatedAt
`;
var EVENT_FIELDS = `id eventType scopeType scopeId timestamp payload`;
function sessionId(ctx, position = 2) {
  const explicit = ctx.args[position];
  const implicit = ctx.env.TRACE_SESSION_ID;
  return explicit || implicit || usage("Session ID is required outside a Trace session");
}
function printSession(session) {
  return [
    `${session.name} (${session.id})`,
    `Status: ${session.sessionStatus} / ${session.agentStatus}`,
    `Tool: ${session.tool}${session.model ? ` (${session.model})` : ""}`,
    `Hosting: ${session.hosting}`,
    `Group: ${session.sessionGroupId ?? "none"}`,
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
var sessionCommands = [
  {
    path: ["session", "get"],
    usage: "trace session get [session-id] [--json]",
    description: "Get a session, defaulting to TRACE_SESSION_ID",
    async run(ctx) {
      const session = await getSession(ctx, sessionId(ctx));
      ctx.output({ session }, printSession(session));
    }
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
      const result = await client.graphql(
        `mutation TraceCliSendSessionMessage($sessionId: ID!, $text: String!, $clientMutationId: String) {
          sendSessionMessage(sessionId: $sessionId, text: $text, clientMutationId: $clientMutationId) {
            ${EVENT_FIELDS}
          }
        }`,
        { sessionId: id, text, clientMutationId: randomUUID2() }
      );
      ctx.output(
        { event: result.sendSessionMessage },
        `Sent message (${result.sendSessionMessage.id})`
      );
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
      id ||= ctx.env.TRACE_SESSION_ID || "";
      if (!id) usage("Session ID is required outside a Trace session");
      const client = await ctx.client();
      const organizationId = client.organizationId ?? usage("Organization is required");
      const variables = {
        organizationId,
        scope: { type: "session", id },
        limit
      };
      const result = await client.graphql(
        `query TraceCliSessionEvents($organizationId: ID!, $scope: ScopeInput!, $limit: Int) {
          events(organizationId: $organizationId, scope: $scope, limit: $limit) { ${EVENT_FIELDS} }
        }`,
        variables
      );
      ctx.output(
        { events: result.events, following: follow },
        result.events.length ? result.events.map((event) => `${event.timestamp}	${event.eventType}	${event.id}`).join("\n") : "No events found"
      );
      if (!follow) return;
      await client.subscribe(
        `subscription TraceCliFollowSession($sessionId: ID!, $organizationId: ID!) {
          sessionEvents(sessionId: $sessionId, organizationId: $organizationId) { ${EVENT_FIELDS} }
        }`,
        { sessionId: id, organizationId },
        (data) => {
          const event = data.sessionEvents;
          process.stdout.write(
            ctx.options.json ? `${JSON.stringify({ event })}
` : `${event.timestamp}	${event.eventType}	${event.id}
`
          );
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
  constructor(serverUrl, token, organizationId) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.organizationId = organizationId;
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
      const serverUrl = env.TRACE_SERVER_URL || env.TRACE_API_URL;
      if (!serverUrl) {
        throw new CliError(
          "The Trace server URL is unavailable in this session",
          ExitCode.authentication,
          "authentication"
        );
      }
      const organizationId = env.TRACE_ORGANIZATION_ID;
      if (requireOrganization && !organizationId) {
        throw new CliError(
          "The Trace organization is unavailable in this session",
          ExitCode.authentication,
          "authentication"
        );
      }
      return new TraceClient(serverUrl, token, organizationId);
    }
  };
}

// src/main.ts
var commands = [
  contextCommand,
  ...sessionCommands,
  artifactCommand
];
function help() {
  return [
    "Usage: trace <command> [options]",
    "",
    "Commands:",
    ...commands.map((command) => `  ${command.path.join(" ").padEnd(22)} ${command.description}`),
    "",
    "Global option: --json",
    "",
    "This command is available inside Trace-managed AI sessions."
  ].join("\n");
}
async function run(argv = process.argv.slice(2)) {
  const wantsJson = argv.includes("--json");
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${help()}
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
