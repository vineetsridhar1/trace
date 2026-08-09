#!/usr/bin/env node

// src/commands/artifact.ts
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// ../cli-contract/dist/index.js
var TRACE_CLI_ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;
function operation(definition) {
  return definition;
}
var SESSION_FIELDS = `
  id name agentStatus sessionStatus tool model reasoningEffort hosting branch sessionGroupId
  createdAt updatedAt channel { id name } repo { id name }
`;
var EVENT_FIELDS = `id eventType scopeType scopeId timestamp payload`;
var traceCliOperations = {
  integrationCatalog: operation({
    name: "TraceCliIntegrationCatalog",
    type: "query",
    rootField: "supportedAppIntegrations",
    capability: "integration:read",
    argumentPaths: [],
    document: `query TraceCliIntegrationCatalog {
      supportedAppIntegrations {
        id name provider providerConfigKey description guide
        capabilities { id name description guide allowedMethods allowedPathPrefixes }
      }
    }`
  }),
  integrationConnections: operation({
    name: "TraceCliIntegrationConnections",
    type: "query",
    rootField: "integrationConnections",
    capability: "integration:read",
    argumentPaths: [],
    document: `query TraceCliIntegrationConnections {
      integrationConnections {
        id ownerUserId provider providerConfigKey displayName kind status lastError
      }
    }`
  }),
  appIntegrationBindings: operation({
    name: "TraceCliAppIntegrationBindings",
    type: "query",
    rootField: "appIntegrationBindings",
    capability: "integration:read",
    argumentPaths: ["sessionGroupId"],
    document: `query TraceCliAppIntegrationBindings($sessionGroupId: ID!) {
      appIntegrationBindings(sessionGroupId: $sessionGroupId) {
        id sessionGroupId label provider providerConfigKey executionIdentity sharedConnectionId
        allowedMethods allowedPathPrefixes
      }
    }`
  }),
  createIntegrationConnectSession: operation({
    name: "TraceCliCreateIntegrationConnectSession",
    type: "mutation",
    rootField: "createNangoConnectSession",
    capability: "integration:connect",
    argumentPaths: ["input.integrationId", "input.kind"],
    document: `mutation TraceCliCreateIntegrationConnectSession($input: CreateNangoConnectSessionInput!) {
      createNangoConnectSession(input: $input) { connectLink expiresAt }
    }`
  }),
  upsertAppIntegrationBinding: operation({
    name: "TraceCliUpsertAppIntegrationBinding",
    type: "mutation",
    rootField: "upsertAppIntegrationBinding",
    capability: "integration:configure",
    argumentPaths: [
      "input.sessionGroupId",
      "input.id",
      "input.integrationId",
      "input.capabilityIds",
      "input.executionIdentity",
      "input.sharedConnectionId"
    ],
    document: `mutation TraceCliUpsertAppIntegrationBinding($input: UpsertAppIntegrationBindingInput!) {
      upsertAppIntegrationBinding(input: $input) {
        id sessionGroupId label provider providerConfigKey executionIdentity sharedConnectionId
        allowedMethods allowedPathPrefixes
      }
    }`
  }),
  deleteAppIntegrationBinding: operation({
    name: "TraceCliDeleteAppIntegrationBinding",
    type: "mutation",
    rootField: "deleteAppIntegrationBinding",
    capability: "integration:configure",
    argumentPaths: ["id", "sessionGroupId"],
    document: `mutation TraceCliDeleteAppIntegrationBinding($id: ID!, $sessionGroupId: ID!) {
      deleteAppIntegrationBinding(id: $id, sessionGroupId: $sessionGroupId)
    }`
  }),
  channels: operation({
    name: "TraceCliChannels",
    type: "query",
    rootField: "channels",
    capability: "resource:list",
    argumentPaths: ["organizationId", "memberOnly"],
    document: `query TraceCliChannels($organizationId: ID!, $memberOnly: Boolean) {
      channels(organizationId: $organizationId, memberOnly: $memberOnly) {
        id name type visibility baseBranch viewerIsMember
        repo { id name }
        projects { id name }
      }
    }`
  }),
  repos: operation({
    name: "TraceCliRepos",
    type: "query",
    rootField: "repos",
    capability: "resource:list",
    argumentPaths: ["organizationId"],
    document: `query TraceCliRepos($organizationId: ID!) {
      repos(organizationId: $organizationId) { id name provider remoteUrl defaultBranch }
    }`
  }),
  projects: operation({
    name: "TraceCliProjects",
    type: "query",
    rootField: "projects",
    capability: "resource:list",
    argumentPaths: ["organizationId", "repoId"],
    document: `query TraceCliProjects($organizationId: ID!, $repoId: ID) {
      projects(organizationId: $organizationId, repoId: $repoId) { id name repo { id name } }
    }`
  }),
  session: operation({
    name: "TraceCliSession",
    type: "query",
    rootField: "session",
    capability: "session:read",
    argumentPaths: ["id"],
    document: `query TraceCliSession($id: ID!) { session(id: $id) { ${SESSION_FIELDS} } }`
  }),
  startContextSession: operation({
    name: "TraceCliStartContextSession",
    type: "query",
    rootField: "session",
    capability: "session:read",
    argumentPaths: ["id"],
    document: `query TraceCliStartContextSession($id: ID!) {
      session(id: $id) {
        id tool model reasoningEffort hosting
        channel { id name repo { id name } }
        repo { id name }
        projects { id }
        connection { environmentId runtimeInstanceId }
        sessionGroup { kind visibility }
      }
    }`
  }),
  startChannel: operation({
    name: "TraceCliStartChannel",
    type: "query",
    rootField: "channel",
    capability: "resource:list",
    argumentPaths: ["id"],
    document: `query TraceCliStartChannel($id: ID!) {
      channel(id: $id) { id name repo { id name } }
    }`
  }),
  startProject: operation({
    name: "TraceCliStartProject",
    type: "query",
    rootField: "project",
    capability: "resource:list",
    argumentPaths: ["id"],
    document: `query TraceCliStartProject($id: ID!) {
      project(id: $id) { id name repo { id name } }
    }`
  }),
  sessions: operation({
    name: "TraceCliSessions",
    type: "query",
    rootField: "sessions",
    capability: "session:list",
    argumentPaths: [
      "organizationId",
      "filters.agentStatus",
      "filters.tool",
      "filters.repoId",
      "filters.channelId",
      "filters.includeArchived",
      "filters.includeMerged",
      "filters.limit"
    ],
    document: `query TraceCliSessions($organizationId: ID!, $filters: SessionFilters) {
      sessions(organizationId: $organizationId, filters: $filters) { ${SESSION_FIELDS} }
    }`
  }),
  startSession: operation({
    name: "TraceCliStartSession",
    type: "mutation",
    rootField: "startSession",
    capability: "session:create",
    argumentPaths: [
      "input.clientMutationId",
      "input.kind",
      "input.tool",
      "input.model",
      "input.reasoningEffort",
      "input.visibility",
      "input.environmentId",
      "input.hosting",
      "input.runtimeInstanceId",
      "input.deferRuntimeSelection",
      "input.repoId",
      "input.branch",
      "input.ticketId",
      "input.channelId",
      "input.sessionGroupId",
      "input.projectId",
      "input.prompt",
      "input.interactionMode"
    ],
    document: `mutation TraceCliStartSession($input: StartSessionInput!) {
      startSession(input: $input) { ${SESSION_FIELDS} }
    }`
  }),
  queueSessionMessage: operation({
    name: "TraceCliQueueSessionMessage",
    type: "mutation",
    rootField: "queueSessionMessage",
    capability: "session:send",
    argumentPaths: ["sessionId", "text", "interactionMode"],
    document: `mutation TraceCliQueueSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
      queueSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
        id sessionId text position createdAt
      }
    }`
  }),
  sendSessionMessage: operation({
    name: "TraceCliSendSessionMessage",
    type: "mutation",
    rootField: "sendSessionMessage",
    capability: "session:send",
    argumentPaths: ["sessionId", "text", "interactionMode", "clientMutationId"],
    document: `mutation TraceCliSendSessionMessage(
      $sessionId: ID!
      $text: String!
      $interactionMode: String
      $clientMutationId: String
    ) {
      sendSessionMessage(
        sessionId: $sessionId
        text: $text
        interactionMode: $interactionMode
        clientMutationId: $clientMutationId
      ) { ${EVENT_FIELDS} }
    }`
  }),
  runSession: operation({
    name: "TraceCliRunSession",
    type: "mutation",
    rootField: "runSession",
    capability: "session:run",
    argumentPaths: ["id", "prompt", "interactionMode"],
    document: `mutation TraceCliRunSession($id: ID!, $prompt: String, $interactionMode: String) {
      runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) { ${SESSION_FIELDS} }
    }`
  }),
  stopSession: operation({
    name: "TraceCliStopSession",
    type: "mutation",
    rootField: "terminateSession",
    capability: "session:stop",
    argumentPaths: ["id"],
    document: `mutation TraceCliStopSession($id: ID!) {
      terminateSession(id: $id) { ${SESSION_FIELDS} }
    }`
  }),
  archiveSession: operation({
    name: "TraceCliArchiveSession",
    type: "mutation",
    rootField: "archiveSessionGroup",
    capability: "session:archive",
    argumentPaths: ["id"],
    document: `mutation TraceCliArchiveSession($id: ID!) {
      archiveSessionGroup(id: $id) { id name status archivedAt }
    }`
  }),
  sessionEvents: operation({
    name: "TraceCliSessionEvents",
    type: "query",
    rootField: "events",
    capability: "session:events",
    argumentPaths: ["organizationId", "scope.type", "scope.id", "limit", "before"],
    document: `query TraceCliSessionEvents(
      $organizationId: ID!
      $scope: ScopeInput!
      $limit: Int
      $before: DateTime
    ) {
      events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {
        ${EVENT_FIELDS}
      }
    }`
  }),
  followSession: operation({
    name: "TraceCliFollowSession",
    type: "subscription",
    rootField: "sessionEvents",
    capability: "session:events",
    argumentPaths: ["sessionId", "organizationId", "after", "afterEventId"],
    document: `subscription TraceCliFollowSession(
      $sessionId: ID!
      $organizationId: ID!
      $after: DateTime
      $afterEventId: ID
    ) {
      sessionEvents(
        sessionId: $sessionId
        organizationId: $organizationId
        after: $after
        afterEventId: $afterEventId
      ) { ${EVENT_FIELDS} }
    }`
  })
};
var operationsByName = new Map(Object.values(traceCliOperations).map((definition) => [definition.name, definition]));

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

// src/client.ts
var CONNECTION_ACK_TIMEOUT_MS = 1e4;
var REQUEST_TIMEOUT_MS = 3e4;
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
        body: init.body === void 0 ? void 0 : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
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
  async graphql(operation2, variables) {
    let response;
    try {
      response = await fetch(new URL("/graphql", this.serverUrl), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          operationName: operation2.name,
          query: operation2.document,
          variables
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
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
  async subscribe(operation2, variables, onData) {
    const url = new URL("/graphql", this.serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, "graphql-transport-ws");
    await new Promise((resolve2, reject) => {
      let acknowledged = false;
      let completed = false;
      let failed = false;
      let stopped = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        clearTimeout(ackTimeout);
        reject(error);
      };
      const close = () => {
        stopped = true;
        clearTimeout(ackTimeout);
        socket.close(1e3, "CLI stopped following");
      };
      const ackTimeout = setTimeout(() => {
        fail(
          new CliError(
            `Trace did not acknowledge the subscription connection within ${CONNECTION_ACK_TIMEOUT_MS / 1e3} seconds`,
            ExitCode.connectivity,
            "connectivity"
          )
        );
        socket.close(1e3, "Connection acknowledgement timed out");
      }, CONNECTION_ACK_TIMEOUT_MS);
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
        if (payload.type === "connection_ack" && !acknowledged) {
          acknowledged = true;
          clearTimeout(ackTimeout);
          socket.send(
            JSON.stringify({
              id: "trace-cli",
              type: "subscribe",
              payload: {
                operationName: operation2.name,
                query: operation2.document,
                variables
              }
            })
          );
        } else if (payload.type === "next" && payload.payload && !Array.isArray(payload.payload) && payload.payload.data) {
          onData(payload.payload.data);
        } else if (payload.type === "error") {
          const errors = Array.isArray(payload.payload) ? payload.payload : [];
          fail(graphQlError(errors[0] ?? {}));
          socket.close();
        } else if (payload.type === "complete") {
          completed = true;
          socket.close(1e3, "Subscription completed");
        }
      });
      socket.addEventListener("error", () => {
        fail(
          new CliError(`Could not connect to ${url.origin}`, ExitCode.connectivity, "connectivity")
        );
        socket.close();
      });
      socket.addEventListener("close", (event) => {
        clearTimeout(ackTimeout);
        process.removeListener("SIGINT", close);
        if (failed) return;
        if (stopped || completed) {
          resolve2();
          return;
        }
        if (!acknowledged && (event.code === 4401 || event.code === 4403)) {
          fail(
            new CliError(
              event.reason || "Trace rejected the subscription credential",
              ExitCode.authentication,
              "authentication"
            )
          );
          return;
        }
        fail(
          new CliError(
            event.reason || `Trace subscription closed unexpectedly (${event.code})`,
            ExitCode.connectivity,
            "connectivity"
          )
        );
      });
    });
  }
};

// src/runtime.ts
function defineCommand(definition) {
  return definition;
}
function assertCommandDefinitions(commands2) {
  const paths = /* @__PURE__ */ new Set();
  for (const command of commands2) {
    const path = command.path.join(" ");
    if (!path || paths.has(path)) throw new Error(`Duplicate or empty command path: ${path}`);
    paths.add(path);
    const optionNames = /* @__PURE__ */ new Set();
    const optionFlags = /* @__PURE__ */ new Set();
    for (const option of command.options ?? []) {
      if (optionNames.has(option.name) || optionFlags.has(option.flag)) {
        throw new Error(`Duplicate option in command ${path}: ${option.flag}`);
      }
      optionNames.add(option.name);
      optionFlags.add(option.flag);
    }
    const positionals = command.positionals ?? [];
    const variadicIndex = positionals.findIndex((definition) => definition.variadic);
    if (variadicIndex !== -1 && variadicIndex !== positionals.length - 1) {
      throw new Error(`Variadic positional must be last for ${path}`);
    }
  }
}
function parseGlobalOptions(argv) {
  const args = [];
  const options = { json: false };
  let help = false;
  let optionsEnded = false;
  for (const value of argv) {
    if (value === "--") {
      optionsEnded = true;
      args.push(value);
    } else if (!optionsEnded && value === "--json") options.json = true;
    else if (!optionsEnded && (value === "--help" || value === "-h")) help = true;
    else args.push(value);
  }
  return { args, options, help };
}
function findCommand(commands2, args) {
  return commands2.filter((candidate) => candidate.path.every((part, index) => args[index] === part)).sort((left, right) => right.path.length - left.path.length)[0];
}
function parseOptionValue(definition, raw) {
  if (definition.kind === "boolean") return true;
  if (definition.kind === "string") {
    if (definition.choices && !definition.choices.includes(raw)) {
      usage(`${definition.flag} must be one of: ${definition.choices.join(", ")}`);
    }
    return raw;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) usage(`${definition.flag} requires an integer`);
  if (definition.min !== void 0 && value < definition.min) {
    usage(`${definition.flag} must be at least ${definition.min}`);
  }
  if (definition.max !== void 0 && value > definition.max) {
    usage(`${definition.flag} must be at most ${definition.max}`);
  }
  return value;
}
function parseCommandInput(command, args) {
  const definitions = new Map((command.options ?? []).map((option) => [option.flag, option]));
  const options = {};
  const providedOptions = /* @__PURE__ */ new Set();
  const positionals = [];
  let optionsEnded = false;
  for (let index = command.path.length; index < args.length; index += 1) {
    const raw = args[index] ?? "";
    if (!optionsEnded && raw === "--") {
      optionsEnded = true;
      continue;
    }
    if (optionsEnded) {
      positionals.push(raw);
      continue;
    }
    const equals = raw.indexOf("=");
    const flag = equals === -1 ? raw : raw.slice(0, equals);
    const definition = definitions.get(flag);
    if (!definition) {
      if (raw.startsWith("--")) usage(`Unknown option: ${flag}`);
      positionals.push(raw);
      continue;
    }
    if (providedOptions.has(definition.name)) usage(`${definition.flag} may only be provided once`);
    providedOptions.add(definition.name);
    if (definition.kind === "boolean") {
      if (equals !== -1) usage(`${definition.flag} does not accept a value`);
      options[definition.name] = true;
      continue;
    }
    const value = equals === -1 ? args[++index] : raw.slice(equals + 1);
    if (!value) usage(`${definition.flag} requires ${definition.valueName}`);
    options[definition.name] = parseOptionValue(definition, value);
  }
  const positionalDefinitions = command.positionals ?? [];
  const variadicIndex = positionalDefinitions.findIndex((definition) => definition.variadic);
  const minimum = positionalDefinitions.filter((definition) => definition.required).length;
  if (positionals.length < minimum) {
    const missing = positionalDefinitions.find(
      (definition, index) => definition.required && index >= positionals.length
    );
    usage(`${missing?.name ?? "Argument"} is required`);
  }
  if (variadicIndex === -1 && positionals.length > positionalDefinitions.length) {
    usage(`Unexpected argument: ${positionals[positionalDefinitions.length]}`);
  }
  return { positionals, options, providedOptions };
}
function optionString(input, name) {
  const value = input.options[name];
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new Error(`Option ${name} is not a string`);
  return value;
}
function optionInteger(input, name) {
  const value = input.options[name];
  if (value === void 0) return void 0;
  if (typeof value !== "number") throw new Error(`Option ${name} is not a number`);
  return value;
}
function optionBoolean(input, name) {
  return input.options[name] === true;
}
function commandUsage(command) {
  const positionals = (command.positionals ?? []).map((definition) => {
    const value = definition.variadic ? `${definition.name}...` : definition.name;
    return definition.required ? `<${value}>` : `[${value}]`;
  });
  const options = (command.options ?? []).map(
    (definition) => definition.kind === "boolean" ? `[${definition.flag}]` : `[${definition.flag} ${definition.valueName}]`
  );
  return ["trace", ...command.path, ...positionals, ...options, "[--json]"].join(" ");
}
function commandHelp(command) {
  const options = command.options ?? [];
  return [
    `Usage: ${commandUsage(command)}`,
    "",
    command.description,
    ...options.length ? [
      "",
      "Options:",
      ...options.map((definition) => {
        const label = definition.kind === "boolean" ? definition.flag : `${definition.flag} ${definition.valueName}`;
        return `  ${label.padEnd(30)} ${definition.description}`;
      })
    ] : []
  ].join("\n");
}
function commandDescriptor(command) {
  return {
    path: command.path,
    description: command.description,
    usage: commandUsage(command),
    positionals: command.positionals ?? [],
    options: command.options ?? []
  };
}
function createCommandContext(options, env = process.env) {
  return {
    options,
    env,
    output(value, human) {
      process.stdout.write(options.json ? `${JSON.stringify(value)}
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

// src/commands/artifact.ts
var UPLOAD_TIMEOUT_MS = 2 * 60 * 1e3;
var artifactCommand = defineCommand({
  path: ["artifact", "push"],
  description: "Upload an immutable artifact from an active Trace invocation",
  positionals: [
    { name: "type", required: true },
    { name: "file-or-directory", required: true }
  ],
  options: [
    {
      name: "key",
      flag: "--key",
      kind: "string",
      valueName: "KEY",
      description: "Artifact slot key"
    },
    {
      name: "idempotencyKey",
      flag: "--idempotency-key",
      kind: "string",
      valueName: "KEY",
      description: "Retry-safe upload key"
    }
  ],
  async run(ctx, input) {
    const type = input.positionals[0] ?? usage("Artifact type is required");
    const sourceArg = input.positionals[1] ?? usage("Artifact file or directory is required");
    const source = resolve(sourceArg);
    const key = optionString(input, "key") ?? (type === "visual-plan" || type === "trace.visual-plan.v1" ? "primary" : "default");
    const idempotencyKey = optionString(input, "idempotencyKey") ?? randomUUID();
    if (idempotencyKey.length > 200) usage("--idempotency-key must be at most 200 characters");
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
        throw new CliError("video validation failed; artifact was not uploaded", 1, "validation");
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
      if (statSync(archivePath).size > TRACE_CLI_ARTIFACT_MAX_BYTES) {
        usage(
          `Artifact archive exceeds the ${TRACE_CLI_ARTIFACT_MAX_BYTES / 1024 / 1024} MiB upload limit`
        );
      }
      const upload = () => fetch(new URL("/agent/artifacts", apiUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/gzip",
          "X-Trace-Artifact-Type": type,
          "X-Trace-Artifact-Key": key,
          "X-Trace-Idempotency-Key": idempotencyKey
        },
        body: readFileSync(archivePath),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
      });
      let response;
      try {
        response = await upload();
        if (response.status >= 500) response = await upload();
      } catch {
        try {
          response = await upload();
        } catch {
          throw new CliError(
            `Could not connect to Trace; retry with --idempotency-key ${idempotencyKey}`,
            ExitCode.connectivity,
            "connectivity"
          );
        }
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.artifact?.id !== "string") {
        const error = response.status === 401 ? { exitCode: ExitCode.authentication, category: "authentication" } : response.status === 403 ? { exitCode: ExitCode.authorization, category: "authorization" } : response.status >= 400 && response.status < 500 ? { exitCode: ExitCode.validation, category: "validation" } : { exitCode: ExitCode.server, category: "server" };
        throw new CliError(
          `${typeof result.error === "string" ? result.error : "Artifact upload failed"}; retry with --idempotency-key ${idempotencyKey}`,
          error.exitCode,
          error.category
        );
      }
      ctx.output(
        { artifact: { id: result.artifact.id, type, key }, idempotencyKey },
        result.artifact.id
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});

// src/commands/organization.ts
function requireOrganizationId(value) {
  return value || usage("The Trace organization is unavailable in this session");
}

// src/commands/channel/list.ts
var channelListCommand = defineCommand({
  path: ["channel", "list"],
  description: "List channels available to the session owner",
  options: [
    {
      name: "memberOnly",
      flag: "--member-only",
      kind: "boolean",
      description: "Only include channels the session owner has joined"
    }
  ],
  async run(ctx, input) {
    const client = await ctx.client();
    const variables = {
      organizationId: requireOrganizationId(client.organizationId),
      memberOnly: optionBoolean(input, "memberOnly")
    };
    const result = await client.graphql(
      traceCliOperations.channels,
      variables
    );
    ctx.output(
      { channels: result.channels },
      result.channels.length ? result.channels.map(
        (channel) => `${channel.id}	${channel.name}	${channel.visibility}	${channel.repo?.name ?? "no repo"}`
      ).join("\n") : "No channels found"
    );
  }
});

// src/commands/context.ts
var contextCommand = defineCommand({
  path: ["context"],
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
});

// src/commands/integration/shared.ts
function requireCurrentAppGroup(ctx) {
  const sessionGroupId = ctx.env.TRACE_SESSION_GROUP_ID;
  if (!sessionGroupId) {
    throw new CliError(
      "This command requires an active Trace app session",
      ExitCode.validation,
      "validation"
    );
  }
  return sessionGroupId;
}
async function loadIntegrationCatalog(client) {
  const result = await client.graphql(traceCliOperations.integrationCatalog, {});
  return result.supportedAppIntegrations;
}
async function loadIntegrationBindings(client, sessionGroupId) {
  const variables = { sessionGroupId };
  const result = await client.graphql(traceCliOperations.appIntegrationBindings, variables);
  return result.appIntegrationBindings;
}

// src/commands/integration/add.ts
var integrationAddCommand = defineCommand({
  path: ["integration", "add"],
  description: "Add or update a supported integration on the current Trace app",
  positionals: [{ name: "integration", required: true }],
  options: [
    {
      name: "capabilities",
      flag: "--capabilities",
      kind: "string",
      valueName: "ID,ID",
      description: "Least-privilege capability IDs from integration list"
    },
    {
      name: "identity",
      flag: "--identity",
      kind: "string",
      valueName: "MODE",
      choices: ["viewer", "shared", "service"],
      description: "Account selection mode (default: viewer)"
    },
    {
      name: "connection",
      flag: "--connection",
      kind: "string",
      valueName: "ID",
      description: "Connected account ID for shared or service identity"
    }
  ],
  async run(ctx, input) {
    const integrationId = input.positionals[0] ?? usage("Integration is required");
    const sessionGroupId = requireCurrentAppGroup(ctx);
    const client = await ctx.client();
    const [catalog, bindings] = await Promise.all([
      loadIntegrationCatalog(client),
      loadIntegrationBindings(client, sessionGroupId)
    ]);
    const integration = catalog.find((candidate) => candidate.id === integrationId);
    if (!integration) usage(`Unsupported integration: ${integrationId}`);
    const requestedCapabilities = optionString(input, "capabilities");
    const capabilityIds = requestedCapabilities ? requestedCapabilities.split(",").map((value) => value.trim()).filter(Boolean) : integration.capabilities.length === 1 ? [integration.capabilities[0]?.id ?? ""] : usage(
      `--capabilities is required; choose from: ${integration.capabilities.map((item) => item.id).join(", ")}`
    );
    const invalidCapability = capabilityIds.find(
      (id) => !integration.capabilities.some((capability) => capability.id === id)
    );
    if (invalidCapability) usage(`Unknown ${integrationId} capability: ${invalidCapability}`);
    const executionIdentity = optionString(input, "identity") ?? "viewer";
    const sharedConnectionId = optionString(input, "connection") ?? null;
    if (executionIdentity === "viewer" && sharedConnectionId) {
      usage("--connection is only valid with shared or service identity");
    }
    if (executionIdentity !== "viewer" && !sharedConnectionId) {
      usage(`--connection is required with ${executionIdentity} identity`);
    }
    const existing = bindings.find(
      (binding) => binding.providerConfigKey === integration.providerConfigKey
    );
    const variables = {
      input: {
        ...existing ? { id: existing.id } : {},
        sessionGroupId,
        integrationId,
        capabilityIds,
        executionIdentity,
        sharedConnectionId
      }
    };
    const result = await client.graphql(traceCliOperations.upsertAppIntegrationBinding, variables);
    ctx.output(
      {
        integration,
        selectedCapabilities: integration.capabilities.filter(
          (capability) => capabilityIds.includes(capability.id)
        ),
        binding: result.upsertAppIntegrationBinding
      },
      `${integration.name} is ready for this app using ${executionIdentity} identity`
    );
  }
});

// src/commands/integration/connect.ts
var integrationConnectCommand = defineCommand({
  path: ["integration", "connect"],
  description: "Create an authorization link for a personal or organization service account",
  positionals: [{ name: "integration", required: true }],
  options: [
    {
      name: "service",
      flag: "--service",
      kind: "boolean",
      description: "Connect an organization service account (admins only)"
    }
  ],
  async run(ctx, input) {
    const integrationId = input.positionals[0] ?? usage("Integration is required");
    const client = await ctx.client();
    const variables = {
      input: {
        integrationId,
        kind: optionBoolean(input, "service") ? "service" : "personal"
      }
    };
    const result = await client.graphql(traceCliOperations.createIntegrationConnectSession, variables);
    const session = result.createNangoConnectSession;
    ctx.output(
      { integrationId, kind: variables.input.kind, ...session },
      `Authorize ${integrationId}: ${session.connectLink}`
    );
  }
});

// src/commands/integration/list.ts
var integrationListCommand = defineCommand({
  path: ["integration", "list"],
  description: "List supported integrations, connected accounts, usage guides, and current app access",
  async run(ctx) {
    const client = await ctx.client();
    const sessionGroupId = ctx.env.TRACE_SESSION_GROUP_ID;
    const [integrations, connectionResult, bindings] = await Promise.all([
      loadIntegrationCatalog(client),
      client.graphql(traceCliOperations.integrationConnections, {}),
      sessionGroupId ? loadIntegrationBindings(client, sessionGroupId) : Promise.resolve([])
    ]);
    const connections = connectionResult.integrationConnections;
    const value = {
      integrations: integrations.map((integration) => ({
        ...integration,
        connections: connections.filter(
          (connection) => connection.providerConfigKey === integration.providerConfigKey
        ),
        appAccess: bindings.filter(
          (binding) => binding.providerConfigKey === integration.providerConfigKey
        )
      })),
      sessionGroupId: sessionGroupId ?? null
    };
    ctx.output(
      value,
      value.integrations.length ? value.integrations.map((integration) => {
        const capabilities = integration.capabilities.map((capability) => capability.id).join(", ");
        const connectionState = integration.connections.length ? `${integration.connections.length} connected account(s)` : "not connected";
        const accessState = integration.appAccess.length ? "added to this app" : "not added";
        return `${integration.id}	${capabilities}	${connectionState}	${accessState}`;
      }).join("\n") : "No supported integrations"
    );
  }
});

// src/commands/integration/remove.ts
var integrationRemoveCommand = defineCommand({
  path: ["integration", "remove"],
  description: "Remove an integration from the current Trace app",
  positionals: [{ name: "integration", required: true }],
  async run(ctx, input) {
    const reference = input.positionals[0] ?? usage("Integration is required");
    const sessionGroupId = requireCurrentAppGroup(ctx);
    const client = await ctx.client();
    const [catalog, bindings] = await Promise.all([
      loadIntegrationCatalog(client),
      loadIntegrationBindings(client, sessionGroupId)
    ]);
    const integration = catalog.find((candidate) => candidate.id === reference);
    const binding = bindings.find(
      (candidate) => candidate.id === reference || integration && candidate.providerConfigKey === integration.providerConfigKey
    );
    if (!binding) usage(`Integration is not configured on this app: ${reference}`);
    const variables = { id: binding.id, sessionGroupId };
    await client.graphql(
      traceCliOperations.deleteAppIntegrationBinding,
      variables
    );
    ctx.output({ removed: true, bindingId: binding.id }, `${binding.label} removed from this app`);
  }
});

// src/commands/integration/index.ts
var integrationCommands = [
  integrationListCommand,
  integrationConnectCommand,
  integrationAddCommand,
  integrationRemoveCommand
];

// src/commands/project/list.ts
var projectListCommand = defineCommand({
  path: ["project", "list"],
  description: "List projects in the current organization",
  options: [
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Only include projects linked to this repository"
    }
  ],
  async run(ctx, input) {
    const client = await ctx.client();
    const variables = {
      organizationId: requireOrganizationId(client.organizationId),
      repoId: optionString(input, "repo") ?? null
    };
    const result = await client.graphql(
      traceCliOperations.projects,
      variables
    );
    ctx.output(
      { projects: result.projects },
      result.projects.length ? result.projects.map((project) => `${project.id}	${project.name}	${project.repo?.name ?? "no repo"}`).join("\n") : "No projects found"
    );
  }
});

// src/commands/repo/list.ts
var repoListCommand = defineCommand({
  path: ["repo", "list"],
  description: "List repositories in the current organization",
  async run(ctx) {
    const client = await ctx.client();
    const variables = { organizationId: requireOrganizationId(client.organizationId) };
    const result = await client.graphql(
      traceCliOperations.repos,
      variables
    );
    ctx.output(
      { repos: result.repos },
      result.repos.length ? result.repos.map((repo) => `${repo.id}	${repo.name}	${repo.provider}	${repo.defaultBranch}`).join("\n") : "No repositories found"
    );
  }
});

// src/commands/session/shared.ts
var AGENT_STATUSES = ["not_started", "active", "done", "failed", "stopped"];
var CODING_TOOLS = [
  "antigravity",
  "claude_code",
  "codex",
  "cursor_composer",
  "custom",
  "pi"
];
var SESSION_KINDS = [
  "coding",
  "design",
  "design_system",
  "app",
  "pdf",
  "animation"
];
var HOSTING_MODES = ["cloud", "local"];
var VISIBILITIES = ["public", "private"];
function resolveSessionId(ctx, explicit) {
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
    traceCliOperations.session,
    { id }
  );
  if (!result.session) usage(`Session not found: ${id}`);
  return result.session;
}
async function resolveStartDefaultsAndDestination(client, input, currentSessionId) {
  if (input.sessionGroupId) return;
  const hasExplicitDestination = !!input.channelId || !!input.projectId || !!input.repoId;
  const hasExplicitGeneratedKind = !!input.kind && input.kind !== "coding";
  const hasExplicitTool = !!input.tool;
  const hasExplicitRuntimeSelection = !!input.environmentId || !!input.runtimeInstanceId || !!input.hosting;
  let impliedRepo = null;
  if (currentSessionId) {
    const result = await client.graphql(traceCliOperations.startContextSession, { id: currentSessionId });
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
    const result = await client.graphql(traceCliOperations.startChannel, { id: input.channelId });
    if (!result.channel) usage(`Channel not found: ${input.channelId}`);
    impliedRepo = result.channel.repo ?? null;
  } else if (input.projectId && !impliedRepo) {
    const result = await client.graphql(traceCliOperations.startProject, { id: input.projectId });
    if (!result.project) usage(`Project not found: ${input.projectId}`);
    impliedRepo = result.project.repo ?? null;
  }
  if (impliedRepo && input.repoId && input.repoId !== impliedRepo.id) {
    usage(
      `The selected destination uses repo ${impliedRepo.id} (${impliedRepo.name}); remove --repo or use that repo`
    );
  }
  input.repoId ??= impliedRepo?.id;
  if (!input.repoId) {
    usage("The selected destination has no repository; add --repo for a coding session");
  }
}
function sessionUiPath(session) {
  if (!session.sessionGroupId) return null;
  return session.channel?.id ? `/c/${session.channel.id}/g/${session.sessionGroupId}/s/${session.id}` : `/g/${session.sessionGroupId}/s/${session.id}`;
}
async function startSessionWithRetry(client, input) {
  const request = () => client.graphql(
    traceCliOperations.startSession,
    { input }
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
          retryError.category
        );
      }
      throw retryError;
    }
  }
}

// src/commands/session/archive.ts
var sessionArchiveCommand = defineCommand({
  path: ["session", "archive"],
  description: "Archive a session's group",
  positionals: [{ name: "session-id" }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" }
  ],
  async run(ctx, input) {
    const id = optionBoolean(input, "self") ? resolveSessionId(ctx) : resolveSessionId(ctx, input.positionals[0]);
    const session = await getSession(ctx, id);
    if (!session.sessionGroupId) usage("This session has no group to archive");
    const client = await ctx.client();
    const result = await client.graphql(
      traceCliOperations.archiveSession,
      { id: session.sessionGroupId }
    );
    ctx.output(
      { sessionGroup: result.archiveSessionGroup },
      `Archived session group (${session.sessionGroupId})`
    );
  }
});

// src/commands/session/events.ts
var sessionEventsCommand = defineCommand({
  path: ["session", "events"],
  description: "Read a bounded event snapshot and optionally follow the session stream",
  positionals: [{ name: "session-id" }],
  options: [
    {
      name: "limit",
      flag: "--limit",
      kind: "integer",
      valueName: "N",
      min: 1,
      max: 500,
      description: "Maximum historical events"
    },
    {
      name: "follow",
      flag: "--follow",
      kind: "boolean",
      description: "Continue streaming new events"
    }
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
      before: "9999-12-31T23:59:59.999Z"
    };
    const result = await client.graphql(
      traceCliOperations.sessionEvents,
      variables
    );
    ctx.output(
      { events: result.events, following: follow },
      result.events.length ? result.events.map((event) => `${event.timestamp}	${event.eventType}	${event.id}`).join("\n") : "No events found"
    );
    if (!follow) return;
    const cursor = result.events.at(-1);
    await client.subscribe(
      traceCliOperations.followSession,
      {
        sessionId: id,
        organizationId,
        after: cursor?.timestamp ?? "1970-01-01T00:00:00.000Z",
        ...cursor ? { afterEventId: cursor.id } : {}
      },
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
});

// src/commands/session/get.ts
var sessionGetCommand = defineCommand({
  path: ["session", "get"],
  description: "Get a session, defaulting to TRACE_SESSION_ID",
  positionals: [{ name: "session-id" }],
  async run(ctx, input) {
    const session = await getSession(ctx, resolveSessionId(ctx, input.positionals[0]));
    ctx.output({ session }, printSession(session));
  }
});

// src/commands/session/list.ts
var sessionListCommand = defineCommand({
  path: ["session", "list"],
  description: "List sessions visible to the session owner",
  options: [
    {
      name: "status",
      flag: "--status",
      kind: "string",
      valueName: "STATUS",
      choices: AGENT_STATUSES,
      description: "Filter by agent status"
    },
    {
      name: "tool",
      flag: "--tool",
      kind: "string",
      valueName: "TOOL",
      choices: CODING_TOOLS,
      description: "Filter by coding tool"
    },
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Filter by repository"
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Filter by channel"
    },
    {
      name: "limit",
      flag: "--limit",
      kind: "integer",
      valueName: "N",
      min: 1,
      max: 500,
      description: "Maximum sessions to return"
    },
    {
      name: "includeArchived",
      flag: "--include-archived",
      kind: "boolean",
      description: "Include archived groups"
    },
    {
      name: "includeMerged",
      flag: "--include-merged",
      kind: "boolean",
      description: "Include merged sessions"
    }
  ],
  async run(ctx, input) {
    const client = await ctx.client();
    const filters = {
      includeArchived: optionBoolean(input, "includeArchived"),
      includeMerged: optionBoolean(input, "includeMerged"),
      agentStatus: optionString(input, "status"),
      tool: optionString(input, "tool"),
      repoId: optionString(input, "repo"),
      channelId: optionString(input, "channel"),
      limit: optionInteger(input, "limit")
    };
    const variables = { organizationId: client.organizationId, filters };
    const result = await client.graphql(
      traceCliOperations.sessions,
      variables
    );
    ctx.output(
      { sessions: result.sessions },
      result.sessions.length ? result.sessions.map(
        (session) => `${session.id}	${session.name}	${session.agentStatus}	${session.tool}`
      ).join("\n") : "No sessions found"
    );
  }
});

// src/commands/session/run.ts
var sessionRunCommand = defineCommand({
  path: ["session", "run"],
  description: "Start or resume a session run",
  positionals: [{ name: "session-id" }, { name: "prompt", variadic: true }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" },
    {
      name: "interactionMode",
      flag: "--interaction-mode",
      kind: "string",
      valueName: "MODE",
      description: "Interaction mode override"
    }
  ],
  async run(ctx, input) {
    const values = [...input.positionals];
    const id = optionBoolean(input, "self") ? resolveSessionId(ctx) : resolveSessionId(ctx, values.shift());
    const variables = {
      id,
      prompt: values.join(" ").trim() || null,
      interactionMode: optionString(input, "interactionMode") ?? null
    };
    const client = await ctx.client();
    const result = await client.graphql(
      traceCliOperations.runSession,
      variables
    );
    ctx.output({ session: result.runSession }, printSession(result.runSession));
  }
});

// src/commands/session/send.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var sessionSendCommand = defineCommand({
  path: ["session", "send"],
  description: "Send or queue a message for a session",
  positionals: [{ name: "session-id" }, { name: "message", required: true, variadic: true }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" },
    {
      name: "queue",
      flag: "--queue",
      kind: "boolean",
      description: "Queue instead of interrupting the active turn"
    },
    {
      name: "interactionMode",
      flag: "--interaction-mode",
      kind: "string",
      valueName: "MODE",
      description: "Interaction mode override"
    }
  ],
  async run(ctx, input) {
    const values = [...input.positionals];
    const id = optionBoolean(input, "self") ? resolveSessionId(ctx) : resolveSessionId(ctx, values.shift());
    const text = values.join(" ").trim();
    if (!text) usage("Message text is required");
    const interactionMode = optionString(input, "interactionMode") ?? null;
    const client = await ctx.client();
    if (optionBoolean(input, "queue")) {
      const variables2 = { sessionId: id, text, interactionMode };
      const result2 = await client.graphql(
        traceCliOperations.queueSessionMessage,
        variables2
      );
      ctx.output(
        { queuedMessage: result2.queueSessionMessage },
        `Queued message (${result2.queueSessionMessage.id})`
      );
      return;
    }
    const variables = { sessionId: id, text, interactionMode, clientMutationId: randomUUID2() };
    const result = await client.graphql(
      traceCliOperations.sendSessionMessage,
      variables
    );
    ctx.output(
      { event: result.sendSessionMessage },
      `Sent message (${result.sendSessionMessage.id})`
    );
  }
});

// src/commands/session/start.ts
import { randomUUID as randomUUID3 } from "node:crypto";
var sessionStartCommand = defineCommand({
  path: ["session", "start"],
  description: "Start a new session group or add a session to an explicit group",
  positionals: [{ name: "prompt", variadic: true }],
  options: [
    {
      name: "group",
      flag: "--group",
      kind: "string",
      valueName: "ID",
      description: "Add the session to an existing group"
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Create the group in this channel"
    },
    {
      name: "project",
      flag: "--project",
      kind: "string",
      valueName: "ID",
      description: "Link the new group to this project"
    },
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Use this repository"
    },
    {
      name: "tool",
      flag: "--tool",
      kind: "string",
      valueName: "TOOL",
      choices: CODING_TOOLS,
      description: "Coding tool"
    },
    {
      name: "model",
      flag: "--model",
      kind: "string",
      valueName: "MODEL",
      description: "Model override"
    },
    {
      name: "reasoning",
      flag: "--reasoning",
      kind: "string",
      valueName: "EFFORT",
      description: "Reasoning effort override"
    },
    {
      name: "hosting",
      flag: "--hosting",
      kind: "string",
      valueName: "MODE",
      choices: HOSTING_MODES,
      description: "Hosting mode"
    },
    {
      name: "runtime",
      flag: "--runtime",
      kind: "string",
      valueName: "ID",
      description: "Runtime instance"
    },
    {
      name: "environment",
      flag: "--environment",
      kind: "string",
      valueName: "ID",
      description: "Environment"
    },
    {
      name: "branch",
      flag: "--branch",
      kind: "string",
      valueName: "NAME",
      description: "Git branch"
    },
    {
      name: "ticket",
      flag: "--ticket",
      kind: "string",
      valueName: "ID",
      description: "Linked ticket"
    },
    {
      name: "kind",
      flag: "--kind",
      kind: "string",
      valueName: "KIND",
      choices: SESSION_KINDS,
      description: "Session group kind"
    },
    {
      name: "visibility",
      flag: "--visibility",
      kind: "string",
      valueName: "VISIBILITY",
      choices: VISIBILITIES,
      description: "Session group visibility"
    },
    {
      name: "interactionMode",
      flag: "--interaction-mode",
      kind: "string",
      valueName: "MODE",
      description: "Initial interaction mode"
    },
    {
      name: "prompt",
      flag: "--prompt",
      kind: "string",
      valueName: "PROMPT",
      description: "Initial prompt"
    },
    {
      name: "idempotencyKey",
      flag: "--idempotency-key",
      kind: "string",
      valueName: "KEY",
      description: "Retry-safe mutation key"
    },
    { name: "defer", flag: "--defer", kind: "boolean", description: "Defer runtime selection" }
  ],
  async run(ctx, parsed) {
    const input = {
      sessionGroupId: optionString(parsed, "group"),
      channelId: optionString(parsed, "channel"),
      projectId: optionString(parsed, "project"),
      repoId: optionString(parsed, "repo"),
      tool: optionString(parsed, "tool"),
      model: optionString(parsed, "model"),
      reasoningEffort: optionString(parsed, "reasoning"),
      hosting: optionString(parsed, "hosting"),
      runtimeInstanceId: optionString(parsed, "runtime"),
      environmentId: optionString(parsed, "environment"),
      branch: optionString(parsed, "branch"),
      ticketId: optionString(parsed, "ticket"),
      kind: optionString(parsed, "kind"),
      visibility: optionString(parsed, "visibility"),
      interactionMode: optionString(parsed, "interactionMode"),
      prompt: optionString(parsed, "prompt"),
      clientMutationId: optionString(parsed, "idempotencyKey") ?? randomUUID3(),
      deferRuntimeSelection: optionBoolean(parsed, "defer") || void 0
    };
    const positionalPrompt = parsed.positionals.join(" ").trim();
    if (positionalPrompt) {
      if (input.prompt) usage("Provide the prompt either positionally or with --prompt, not both");
      input.prompt = positionalPrompt;
    }
    const hasGroup = parsed.providedOptions.has("group");
    const destinationOptions = ["channel", "project", "repo"];
    const groupConfigurationOptions = [
      "kind",
      "hosting",
      "runtime",
      "environment",
      "branch",
      "visibility",
      "defer"
    ];
    if (hasGroup && destinationOptions.some((name) => parsed.providedOptions.has(name))) {
      usage("--group cannot be combined with --channel, --project, or --repo");
    }
    if (hasGroup && groupConfigurationOptions.some((name) => parsed.providedOptions.has(name))) {
      usage(
        "--group cannot be combined with --kind, --hosting, --runtime, --environment, --branch, --visibility, or --defer; sessions inherit those settings from their group"
      );
    }
    const client = await ctx.client();
    await resolveStartDefaultsAndDestination(client, input, ctx.env.TRACE_SESSION_ID);
    const result = await startSessionWithRetry(client, input);
    const runRequested = !!input.prompt;
    const uiPath = sessionUiPath(result.startSession);
    ctx.output(
      {
        session: result.startSession,
        runRequested,
        uiPath,
        idempotencyKey: input.clientMutationId
      },
      [
        printSession(result.startSession),
        runRequested ? "Initial run requested; not_started may be shown while the runtime is provisioning." : "Session created without an initial run.",
        ...uiPath ? [`Open: ${uiPath}`] : []
      ].join("\n")
    );
  }
});

// src/commands/session/stop.ts
var sessionStopCommand = defineCommand({
  path: ["session", "stop"],
  description: "Stop a running session",
  positionals: [{ name: "session-id" }],
  options: [
    { name: "self", flag: "--self", kind: "boolean", description: "Target the current session" }
  ],
  async run(ctx, input) {
    const id = optionBoolean(input, "self") ? resolveSessionId(ctx) : resolveSessionId(ctx, input.positionals[0]);
    const client = await ctx.client();
    const result = await client.graphql(
      traceCliOperations.stopSession,
      { id }
    );
    ctx.output({ session: result.terminateSession }, printSession(result.terminateSession));
  }
});

// src/commands/session/index.ts
var sessionCommands = [
  sessionListCommand,
  sessionGetCommand,
  sessionStartCommand,
  sessionSendCommand,
  sessionRunCommand,
  sessionStopCommand,
  sessionArchiveCommand,
  sessionEventsCommand
];

// src/commands/index.ts
var commands = [
  contextCommand,
  ...integrationCommands,
  channelListCommand,
  repoListCommand,
  projectListCommand,
  ...sessionCommands,
  artifactCommand
];

// src/main.ts
assertCommandDefinitions(commands);
function globalHelp() {
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
function writeHelp(command, json) {
  if (json) {
    const value = command ? { command: commandDescriptor(command) } : {
      commands: commands.map(commandDescriptor),
      globalOptions: [{ flag: "--json", description: "Emit machine-readable JSON" }]
    };
    process.stdout.write(`${JSON.stringify(value)}
`);
    return;
  }
  process.stdout.write(`${command ? commandHelp(command) : globalHelp()}
`);
}
async function run(argv = process.argv.slice(2)) {
  const parsed = parseGlobalOptions(argv);
  const command = findCommand(commands, parsed.args);
  if (argv.length === 0 || parsed.help) {
    writeHelp(command, parsed.options.json);
    return ExitCode.success;
  }
  try {
    if (!command) {
      throw new CliError(
        `Unknown command: ${parsed.args.slice(0, 2).join(" ")}`,
        ExitCode.usage,
        "usage"
      );
    }
    const input = parseCommandInput(command, parsed.args);
    const ctx = createCommandContext(parsed.options);
    await command.run(ctx, input);
    return ExitCode.success;
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError(
      error instanceof Error ? error.message : "Unknown error",
      ExitCode.server,
      "server"
    );
    const value = { error: { category: cliError.category, message: cliError.message } };
    process.stderr.write(
      parsed.options.json ? `${JSON.stringify(value)}
` : `trace: ${cliError.message}
`
    );
    return cliError.exitCode;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
export {
  run
};
