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
var TERMINAL_FIELDS = `id sessionId status cols rows connected`;
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
        id integrationId sessionGroupId label provider providerConfigKey executionIdentity sharedConnectionId
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
        id integrationId sessionGroupId label provider providerConfigKey executionIdentity sharedConnectionId
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
  sessionTerminals: operation({ name: "TraceCliSessionTerminals", type: "query", rootField: "sessionTerminals", capability: "terminal:control", argumentPaths: ["sessionId"], document: `query TraceCliSessionTerminals($sessionId: ID!) { sessionTerminals(sessionId: $sessionId) { ${TERMINAL_FIELDS} } }` }),
  terminalCapture: operation({ name: "TraceCliTerminalCapture", type: "query", rootField: "terminalCapture", capability: "terminal:control", argumentPaths: ["terminalId", "maxBytes", "plainText"], document: `query TraceCliTerminalCapture($terminalId: ID!, $maxBytes: Int, $plainText: Boolean) { terminalCapture(terminalId: $terminalId, maxBytes: $maxBytes, plainText: $plainText) { terminalId output byteCount truncated capturedAt closed connected } }` }),
  createTerminal: operation({ name: "TraceCliCreateTerminal", type: "mutation", rootField: "createTerminal", capability: "terminal:control", argumentPaths: ["sessionId", "cols", "rows"], document: `mutation TraceCliCreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) { createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) { ${TERMINAL_FIELDS} } }` }),
  sendTerminalInput: operation({ name: "TraceCliSendTerminalInput", type: "mutation", rootField: "sendTerminalInput", capability: "terminal:control", argumentPaths: ["terminalId", "data"], document: `mutation TraceCliSendTerminalInput($terminalId: ID!, $data: String!) { sendTerminalInput(terminalId: $terminalId, data: $data) }` }),
  resizeTerminal: operation({ name: "TraceCliResizeTerminal", type: "mutation", rootField: "resizeTerminal", capability: "terminal:control", argumentPaths: ["terminalId", "cols", "rows"], document: `mutation TraceCliResizeTerminal($terminalId: ID!, $cols: Int!, $rows: Int!) { resizeTerminal(terminalId: $terminalId, cols: $cols, rows: $rows) }` }),
  destroyTerminal: operation({ name: "TraceCliDestroyTerminal", type: "mutation", rootField: "destroyTerminal", capability: "terminal:control", argumentPaths: ["terminalId"], document: `mutation TraceCliDestroyTerminal($terminalId: ID!) { destroyTerminal(terminalId: $terminalId) }` }),
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
      "input.prompt",
      "input.interactionMode"
    ],
    document: `mutation TraceCliStartSession($input: StartSessionInput!) {
      startSession(input: $input) { ${SESSION_FIELDS} }
    }`
  }),
  convertSessionGroup: operation({
    name: "TraceCliConvertSessionGroup",
    type: "mutation",
    rootField: "convertSessionGroup",
    capability: "session:convert",
    argumentPaths: [
      "input.sessionGroupId",
      "input.kind",
      "input.channelId",
      "input.repoId",
      "input.tool",
      "input.model",
      "input.reasoningEffort"
    ],
    document: `mutation TraceCliConvertSessionGroup($input: ConvertSessionGroupInput!) {
      convertSessionGroup(input: $input) { ${SESSION_FIELDS} }
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
var TRACE_CLI_EXECUTABLE = '"$TRACE_CLI"';
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
function assertCommandGroups(groups, commands2) {
  const names = /* @__PURE__ */ new Set();
  for (const group of groups) {
    if (!group.name || group.name.includes(" ") || names.has(group.name)) {
      throw new Error(`Duplicate or invalid command group: ${group.name}`);
    }
    names.add(group.name);
    if (!commands2.some((command) => command.path[0] === group.name && command.path.length > 1)) {
      throw new Error(`Command group has no subcommands: ${group.name}`);
    }
  }
  const missing = commands2.find(
    (command) => command.path.length > 1 && !names.has(command.path[0])
  );
  if (missing) throw new Error(`Command has no registered group: ${missing.path.join(" ")}`);
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
    usage(
      `Missing required input: <${missing?.name ?? "argument"}>. Run ${TRACE_CLI_EXECUTABLE} ${command.path.join(" ")} --help for required arguments and examples.`
    );
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
  return [TRACE_CLI_EXECUTABLE, ...command.path, ...positionals, ...options, "[--json]"].join(" ");
}
function commandExample(value) {
  return value.replace(/^trace\b/, TRACE_CLI_EXECUTABLE);
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
    ] : [],
    ...command.examples?.length ? ["", "Examples:", ...command.examples.map((x) => `  ${commandExample(x)}`)] : [],
    ...command.effects?.length ? ["", "Effects:", ...command.effects.map((x) => `  - ${x}`)] : [],
    ...command.output ? ["", "Output:", `  ${command.output}`] : [],
    ...command.nextSteps?.length ? ["", "Next steps:", ...command.nextSteps.map((x) => `  - ${x}`)] : [],
    ...command.notes?.length ? ["", "Notes:", ...command.notes.map((x) => `  - ${x}`)] : []
  ].join("\n");
}
function commandDescriptor(command) {
  return {
    path: command.path,
    description: command.description,
    usage: commandUsage(command),
    positionals: command.positionals ?? [],
    options: command.options ?? [],
    examples: (command.examples ?? []).map(commandExample),
    effects: command.effects ?? [],
    output: command.output ?? null,
    nextSteps: command.nextSteps ?? [],
    notes: command.notes ?? []
  };
}
function commandGroupDescriptor(group, commands2) {
  return {
    name: group.name,
    description: group.description,
    usage: `${TRACE_CLI_EXECUTABLE} ${group.name} <command> [options]`,
    workflow: group.workflow ?? [],
    examples: (group.examples ?? []).map(commandExample),
    notes: group.notes ?? [],
    commands: commands2.filter((command) => command.path[0] === group.name).map(commandDescriptor)
  };
}
function commandGroupHelp(group, commands2) {
  const descriptor = commandGroupDescriptor(group, commands2);
  return [
    `Usage: ${descriptor.usage}`,
    "",
    descriptor.description,
    "",
    "Commands:",
    ...descriptor.commands.map(
      (command) => `  ${command.path.slice(1).join(" ").padEnd(20)} ${command.description}`
    ),
    ...descriptor.workflow.length ? ["", "Workflow:", ...descriptor.workflow.map((step, index) => `  ${index + 1}. ${step}`)] : [],
    ...descriptor.examples.length ? ["", "Examples:", ...descriptor.examples.map((example) => `  ${example}`)] : [],
    ...descriptor.notes.length ? ["", "Notes:", ...descriptor.notes.map((note) => `  - ${note}`)] : [],
    "",
    `Run ${TRACE_CLI_EXECUTABLE} ${group.name} <command> --help for exact arguments and effects.`
  ].join("\n");
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
  examples: [
    '"$TRACE_CLI" artifact push visual-plan docs/plan --key primary --json',
    '"$TRACE_CLI" artifact push video output/demo.mp4 --json'
  ],
  effects: [
    "Packages the supplied file or directory and creates an immutable Trace artifact.",
    "Retries transient upload failures once with the same idempotency key."
  ],
  output: "The artifact ID, type, key, and idempotency key for a safe retry.",
  nextSteps: [
    "Use the artifact type's required skill before preparing or revising its source files.",
    "Keep the returned idempotency key when retrying a failed upload."
  ],
  notes: [
    "Video artifacts must be one validated video file; other artifact types may use a file or directory.",
    "The compressed upload must not exceed 64 MiB."
  ],
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
  examples: [
    '"$TRACE_CLI" channel list --json',
    '"$TRACE_CLI" channel list --member-only --json'
  ],
  effects: ["Read-only; does not join channels or change membership."],
  output: "Channel IDs, names, visibility, and linked repositories.",
  nextSteps: [
    'Pass a channel ID to "$TRACE_CLI" session start --channel <channel-id>.',
    "Use --member-only when selecting a channel for the current user."
  ],
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
  examples: ['"$TRACE_CLI" context --json'],
  effects: ["Read-only; does not change Trace state."],
  output: "The selected server, organization, session, session group, and authentication state.",
  nextSteps: [
    'Run "$TRACE_CLI" channel list --member-only --json to choose a channel.',
    'Run "$TRACE_CLI" session get --json to inspect the current session.'
  ],
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
  examples: [
    '"$TRACE_CLI" integration add github --capabilities profile --identity viewer --json',
    '"$TRACE_CLI" integration add snowflake --identity service --connection <connection-id> --json'
  ],
  effects: [
    "Creates or updates one stable provider binding on the current app.",
    "Emits an app-integration binding event through the Trace service layer."
  ],
  output: "The live integration guide, selected capability guides, and saved current-app binding.",
  nextSteps: [
    "Follow the returned guides to call the stable integration ID from a generated Node route.",
    "Have React call only that same-origin app route.",
    'Run "$TRACE_CLI" integration list --json to verify app access.'
  ],
  notes: [
    "Viewer identity is the default and must not include --connection.",
    "Shared and service identities require a matching connection ID from integration list.",
    "When several capabilities exist, --capabilities is required to prevent accidental broad access."
  ],
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
      (binding) => binding.integrationId === integration.id || !binding.integrationId && binding.providerConfigKey === integration.providerConfigKey
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
  examples: [
    '"$TRACE_CLI" integration connect github --json',
    '"$TRACE_CLI" integration connect github --service --json'
  ],
  effects: [
    "Creates a short-lived provider authorization session.",
    "Does not expose credentials or grant the current app access."
  ],
  output: "The connectLink, its expiration time, integration ID, and personal or service kind.",
  nextSteps: [
    "Give connectLink to the user and wait for provider authorization to finish.",
    'Run "$TRACE_CLI" integration list --json to confirm the connection became active.',
    'Run "$TRACE_CLI" integration add to grant the current app least-privilege access.'
  ],
  notes: [
    "Use --service only when the user explicitly requests an organization-owned identity; organization-admin permission is required."
  ],
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
  examples: ['"$TRACE_CLI" integration list --json'],
  effects: ["Read-only; does not connect an account or change app access."],
  output: "Supported integrations with capability and implementation guides, visible connections, current-app bindings, and the selected sessionGroupId.",
  nextSteps: [
    'Run "$TRACE_CLI" integration connect <id> if a required account is missing.',
    'Run "$TRACE_CLI" integration add <id> with the minimum capability IDs when app access is missing.'
  ],
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
          (binding) => binding.integrationId === integration.id || !binding.integrationId && binding.providerConfigKey === integration.providerConfigKey
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
  examples: ['"$TRACE_CLI" integration remove github --json'],
  effects: [
    "Deletes the matching binding from the current app and emits a binding-deleted event.",
    "Does not disconnect the underlying provider account."
  ],
  output: "The removed binding ID and confirmation flag.",
  nextSteps: [
    'Run "$TRACE_CLI" integration list --json to verify that current-app access is absent.'
  ],
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
      (candidate) => candidate.id === reference || integration && (candidate.integrationId === integration.id || !candidate.integrationId && candidate.providerConfigKey === integration.providerConfigKey)
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

// src/commands/repo/list.ts
var repoListCommand = defineCommand({
  path: ["repo", "list"],
  description: "List repositories in the current organization",
  examples: ['"$TRACE_CLI" repo list --json'],
  effects: ["Read-only; does not clone, modify, or connect repositories."],
  output: "Repository IDs, providers, remote URLs, and default branches.",
  nextSteps: [
    'Pass a repository ID to "$TRACE_CLI" session start --repo <repo-id>.',
    'Run "$TRACE_CLI" channel list --json to find a channel already linked to a repository.'
  ],
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
  "general",
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
  return explicit || ctx.env.TRACE_SESSION_ID || usage(
    'A session ID is required. Provide <session-id>, use --self inside a Trace session, or run "$TRACE_CLI" session list --json to find one.'
  );
}
function requireStartPrompt(prompt) {
  const value = prompt?.trim();
  if (value) return value;
  usage(
    'A task prompt is required to start a session. Provide it after session start or with --prompt "<task>".'
  );
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
  const hasExplicitDestination = !!input.channelId;
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
      impliedRepo = current.channel?.repo ?? current.repo ?? null;
    }
  }
  if (input.kind && input.kind !== "coding") return;
  if (!input.channelId) {
    usage(
      'A channel is required to start a coding session. Provide --channel <channel-id>, or start from a session already in a channel. Discover channels with "$TRACE_CLI" channel list --member-only --json.'
    );
  }
  if (input.channelId && !impliedRepo) {
    const result = await client.graphql(traceCliOperations.startChannel, { id: input.channelId });
    if (!result.channel) usage(`Channel not found: ${input.channelId}`);
    impliedRepo = result.channel.repo ?? null;
  }
  if (impliedRepo && input.repoId && input.repoId !== impliedRepo.id) {
    usage(
      `The selected destination uses repo ${impliedRepo.id} (${impliedRepo.name}); remove --repo or use that repo`
    );
  }
  input.repoId ??= impliedRepo?.id;
  if (!input.repoId) {
    usage(
      'The selected channel has no linked repository. Provide --repo <repo-id>, or choose a coding channel with a repository from "$TRACE_CLI" channel list --json.'
    );
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
  examples: [
    '"$TRACE_CLI" session archive <session-id> --json',
    '"$TRACE_CLI" session archive --self --json'
  ],
  effects: ["Archives the selected session's entire group."],
  output: "The archived session group and its archive timestamp.",
  nextSteps: ['Run "$TRACE_CLI" session list --include-archived --json to find the group again.'],
  notes: ["Archiving --self can end this agent's own ability to continue work."],
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
  examples: [
    '"$TRACE_CLI" session events <session-id> --limit 50 --json',
    '"$TRACE_CLI" session events <session-id> --follow --json'
  ],
  effects: ["Read-only; --follow keeps an event subscription open until it is stopped."],
  output: "A bounded event snapshot and, with --follow, one JSON event per subsequent line.",
  nextSteps: [
    "Use the snapshot to assess progress, then stop following once the requested condition is met.",
    'Run "$TRACE_CLI" session get <session-id> --json for the current status.'
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
  examples: [
    '"$TRACE_CLI" session get --json',
    '"$TRACE_CLI" session get <session-id> --json'
  ],
  effects: ["Read-only; does not change the session."],
  output: "The session's status, tool, hosting, group, channel, repository, and branch.",
  nextSteps: [
    'Run "$TRACE_CLI" session events <session-id> --limit 50 --json for recent activity.',
    'Run "$TRACE_CLI" session send <session-id> "<message>" --queue --json for follow-up work.'
  ],
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
  examples: [
    '"$TRACE_CLI" session list --status active --limit 50 --json',
    '"$TRACE_CLI" session list --channel <channel-id> --json'
  ],
  effects: ["Read-only; does not start, stop, or modify sessions."],
  output: "Matching session IDs, names, agent statuses, and coding tools.",
  nextSteps: [
    'Run "$TRACE_CLI" session get <session-id> --json for details.',
    'Run "$TRACE_CLI" session events <session-id> --limit 50 --json to inspect activity.'
  ],
  notes: ["Archived and merged sessions are excluded unless explicitly included."],
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
  examples: [
    '"$TRACE_CLI" session run <session-id> "Continue with the revised scope" --json',
    '"$TRACE_CLI" session run --self --json'
  ],
  effects: ["Requests that the selected session start or resume work."],
  output: "The updated session status and execution settings.",
  nextSteps: ['Run "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor progress.'],
  notes: ["Do not use this to repeat the prompt already supplied to session start."],
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
  examples: [
    '"$TRACE_CLI" session send <session-id> "Please also cover migrations" --queue --json',
    '"$TRACE_CLI" session send --self "Continue with the revised scope" --json'
  ],
  effects: [
    "Sends a message to the session, or queues it when --queue is supplied.",
    "A non-queued message can interrupt an active turn."
  ],
  output: "The created event, or the queued message and its position.",
  nextSteps: ['Run "$TRACE_CLI" session events <session-id> --limit 50 --json to confirm delivery.'],
  notes: ["Use --queue for an active session unless the user explicitly wants an interruption."],
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
    if (!text) {
      usage(
        'A message is required. Provide text after <session-id>, or use --self "<message>" inside a Trace session.'
      );
    }
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
  examples: [
    '"$TRACE_CLI" session start "Implement the API tests" --json',
    '"$TRACE_CLI" session start "Fix the login flow" --channel <channel-id> --tool codex --json',
    '"$TRACE_CLI" session start "Review this work" --group <group-id> --json'
  ],
  effects: [
    "Creates a session and, unless --group is supplied, creates a new session group.",
    "A prompt requests the initial run in the same operation."
  ],
  output: "The new session, whether an initial run was requested, its UI path, and an idempotency key.",
  nextSteps: [
    'Run "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor progress.',
    'Use "$TRACE_CLI" session send <session-id> "<message>" --queue --json for follow-up work.'
  ],
  notes: [
    "A new coding group needs a channel and task prompt; the channel can be inherited from the current session when available.",
    "--repo validates or supplies the repository for the selected or inherited channel; it never selects a destination by itself.",
    "Do not call session run with the same initial prompt, because that can duplicate the work."
  ],
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
    input.prompt = requireStartPrompt(input.prompt);
    const hasGroup = parsed.providedOptions.has("group");
    const destinationOptions = ["channel", "repo"];
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
      usage("--group cannot be combined with --channel or --repo");
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

// src/commands/session/convert.ts
var CONVERSION_KINDS = SESSION_KINDS.filter(
  (kind) => kind !== "general" && kind !== "design_system"
);
var sessionConvertCommand = defineCommand({
  path: ["session", "convert"],
  description: "Convert the current general session into a specialized session",
  examples: [
    '"$TRACE_CLI" session convert --kind coding --channel <channel-id> --json',
    '"$TRACE_CLI" session convert --kind app --json'
  ],
  effects: [
    "Changes the existing session group in place and preserves its conversation history.",
    "Prepares the target workspace and resumes the request with its session-specific instructions.",
    "App, Design, PDF, and Animation targets create an isolated managed repo in a cloud runtime."
  ],
  output: "The converted session.",
  nextSteps: [
    'Use "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor the resumed run.'
  ],
  notes: [
    "Conversion starts from a General session. Design System authoring uses its dedicated creation flow.",
    "Coding requires a channel; --repo may only supply a repository when that channel has none."
  ],
  options: [
    {
      name: "session",
      flag: "--session",
      kind: "string",
      valueName: "ID",
      description: "Source session"
    },
    {
      name: "kind",
      flag: "--kind",
      kind: "string",
      valueName: "KIND",
      choices: CONVERSION_KINDS,
      description: "Target session kind"
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Target coding channel"
    },
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Repository for a coding channel without one"
    },
    {
      name: "tool",
      flag: "--tool",
      kind: "string",
      valueName: "TOOL",
      choices: CODING_TOOLS,
      description: "Coding tool override"
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
      description: "Reasoning override"
    }
  ],
  async run(ctx, parsed) {
    const kind = optionString(parsed, "kind");
    if (!kind || !CONVERSION_KINDS.includes(kind)) {
      usage(`--kind is required and must be one of: ${CONVERSION_KINDS.join(", ")}`);
    }
    const client = await ctx.client();
    const source = await client.graphql(traceCliOperations.session, {
      id: resolveSessionId(ctx, optionString(parsed, "session"))
    });
    if (!source.session?.sessionGroupId) {
      usage("Session does not belong to a session group");
    }
    let channelId;
    let repoId;
    const explicitChannelId = optionString(parsed, "channel");
    const explicitRepoId = optionString(parsed, "repo");
    if (kind === "coding") {
      channelId = explicitChannelId ?? source.session.channel?.id;
      if (!channelId) {
        usage(
          'A coding channel is required. Provide --channel <channel-id>; discover channels with "$TRACE_CLI" channel list --member-only --json.'
        );
      }
      const channel = await client.graphql(traceCliOperations.startChannel, { id: channelId });
      if (!channel.channel) usage(`Channel not found: ${channelId}`);
      const impliedRepo = channel.channel.repo ?? null;
      if (impliedRepo && explicitRepoId && explicitRepoId !== impliedRepo.id) {
        usage(
          `The selected channel uses repo ${impliedRepo.id} (${impliedRepo.name}); remove --repo or use that repo`
        );
      }
      repoId = impliedRepo?.id ?? explicitRepoId;
      if (!repoId) {
        usage(
          "The selected channel has no linked repository. Provide --repo <repo-id>, or choose a coding channel with a repository."
        );
      }
    } else if (explicitChannelId || explicitRepoId) {
      usage(`${kind} conversions create an isolated workspace; remove --channel and --repo`);
    }
    const input = {
      sessionGroupId: source.session.sessionGroupId,
      kind,
      ...channelId ? { channelId } : {},
      ...repoId ? { repoId } : {},
      tool: optionString(parsed, "tool"),
      model: optionString(parsed, "model"),
      reasoningEffort: optionString(parsed, "reasoning")
    };
    const result = await client.graphql(traceCliOperations.convertSessionGroup, { input });
    ctx.output({ session: result.convertSessionGroup }, printSession(result.convertSessionGroup));
  }
});

// src/commands/session/stop.ts
var sessionStopCommand = defineCommand({
  path: ["session", "stop"],
  description: "Stop a running session",
  examples: [
    '"$TRACE_CLI" session stop <session-id> --json',
    '"$TRACE_CLI" session stop --self --json'
  ],
  effects: ["Stops the selected running session."],
  output: "The stopped session and its final reported status.",
  nextSteps: ['Run "$TRACE_CLI" session get <session-id> --json to confirm its status.'],
  notes: ["Stopping --self can end this agent's own ability to continue work."],
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
  sessionConvertCommand,
  sessionSendCommand,
  sessionRunCommand,
  sessionStopCommand,
  sessionArchiveCommand,
  sessionEventsCommand
];

// src/commands/terminal/index.ts
var KEYS = {
  enter: "\r",
  tab: "	",
  escape: "\x1B",
  backspace: "\x7F",
  up: "\x1B[A",
  down: "\x1B[B",
  left: "\x1B[D",
  right: "\x1B[C",
  "ctrl-c": "",
  "ctrl-d": "",
  "ctrl-l": "\f"
};
function terminalLine(terminal) {
  return `${terminal.id}	${terminal.sessionId}	${terminal.status}	${terminal.cols ?? "-"}x${terminal.rows ?? "-"}	${terminal.connected ? "connected" : "disconnected"}`;
}
function requiredTerminalId(input) {
  return input.positionals[0];
}
var sessionOption = {
  name: "session",
  flag: "--session",
  kind: "string",
  valueName: "ID",
  description: "Session ID; defaults to TRACE_SESSION_ID"
};
var terminalCommands = [
  defineCommand({
    path: ["terminal", "list"],
    description: "List terminals authorized for a session",
    examples: ['"$TRACE_CLI" terminal list --json'],
    effects: ["Read-only; does not create, attach to, or modify a terminal."],
    output: "Terminal IDs with owning session, state, dimensions, and runtime connectivity.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect output.'],
    options: [sessionOption],
    async run(ctx, input) {
      const sessionId = resolveSessionId(ctx, optionString(input, "session"));
      const client = await ctx.client();
      const result = await client.graphql(
        traceCliOperations.sessionTerminals,
        { sessionId }
      );
      ctx.output(
        { terminals: result.sessionTerminals },
        result.sessionTerminals.length ? result.sessionTerminals.map(terminalLine).join("\n") : "No terminals found"
      );
    }
  }),
  defineCommand({
    path: ["terminal", "create"],
    description: "Create a managed terminal on the session runtime",
    examples: ['"$TRACE_CLI" terminal create --cols 120 --rows 30 --json'],
    effects: ["Creates a PTY on the session's authorized runtime; it does not execute a command."],
    output: "The new terminal ID, session, initial state, dimensions, and connectivity.",
    nextSteps: ['Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter to run a command.'],
    options: [
      sessionOption,
      { name: "cols", flag: "--cols", kind: "integer", valueName: "N", min: 20, max: 500, description: "Columns, from 20 to 500 (default: 80)" },
      { name: "rows", flag: "--rows", kind: "integer", valueName: "N", min: 5, max: 200, description: "Rows, from 5 to 200 (default: 24)" }
    ],
    async run(ctx, input) {
      const variables = { sessionId: resolveSessionId(ctx, optionString(input, "session")), cols: optionInteger(input, "cols") ?? 80, rows: optionInteger(input, "rows") ?? 24 };
      const result = await (await ctx.client()).graphql(traceCliOperations.createTerminal, variables);
      ctx.output({ terminal: result.createTerminal }, terminalLine(result.createTerminal));
    }
  }),
  defineCommand({
    path: ["terminal", "capture"],
    description: "Capture bounded terminal scrollback; ANSI is preserved by default",
    examples: ['"$TRACE_CLI" terminal capture <terminal-id> --plain --json'],
    effects: ["Read-only; captures only ephemeral bounded relay scrollback."],
    output: "Output, byte count, truncation state, timestamp, and terminal connectivity state.",
    nextSteps: ['Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter to provide more input.'],
    positionals: [{ name: "terminal-id", required: true }],
    options: [
      { name: "maxBytes", flag: "--max-bytes", kind: "integer", valueName: "N", min: 1, max: 51200, description: "Output byte limit, from 1 to 51200" },
      { name: "plain", flag: "--plain", kind: "boolean", description: "Strip ANSI escape sequences" }
    ],
    async run(ctx, input) {
      const variables = { terminalId: requiredTerminalId(input), maxBytes: optionInteger(input, "maxBytes"), plainText: optionBoolean(input, "plain") };
      const result = await (await ctx.client()).graphql(traceCliOperations.terminalCapture, variables);
      ctx.output({ capture: result.terminalCapture }, result.terminalCapture.output);
    }
  }),
  defineCommand({
    path: ["terminal", "send"],
    description: "Write bounded text to an existing managed terminal",
    examples: ['"$TRACE_CLI" terminal send <terminal-id> "pnpm test" --enter --json'],
    effects: ["Writes to the selected terminal PTY; sent text is never included in Trace events."],
    output: "A confirmation containing the terminal ID, without echoing the sent text.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect command output.'],
    positionals: [{ name: "terminal-id", required: true }, { name: "text", required: true }],
    options: [{ name: "enter", flag: "--enter", kind: "boolean", description: "Append a carriage-return Enter key" }],
    async run(ctx, input) {
      const variables = { terminalId: requiredTerminalId(input), data: `${input.positionals[1]}${optionBoolean(input, "enter") ? "\r" : ""}` };
      await (await ctx.client()).graphql(traceCliOperations.sendTerminalInput, variables);
      ctx.output({ terminalId: variables.terminalId, sent: true }, "Sent");
    }
  }),
  defineCommand({
    path: ["terminal", "key"],
    description: "Send an allowlisted terminal key (for example ctrl-c or enter)",
    examples: ['"$TRACE_CLI" terminal key <terminal-id> ctrl-c --json'],
    effects: ["Writes only the documented key byte sequence to the selected terminal PTY."],
    output: "A confirmation containing the terminal ID and allowlisted key name.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect the terminal state.'],
    positionals: [{ name: "terminal-id", required: true }, { name: "key", required: true }],
    async run(ctx, input) {
      const key = input.positionals[1].toLowerCase();
      const data = KEYS[key];
      if (!data) usage(`Invalid terminal key: ${key}. Allowed keys: ${Object.keys(KEYS).join(", ")}`);
      const variables = { terminalId: requiredTerminalId(input), data };
      await (await ctx.client()).graphql(traceCliOperations.sendTerminalInput, variables);
      ctx.output({ terminalId: variables.terminalId, key, sent: true }, "Sent");
    }
  }),
  defineCommand({
    path: ["terminal", "resize"],
    description: "Resize an existing managed terminal",
    examples: ['"$TRACE_CLI" terminal resize <terminal-id> --cols 140 --rows 40 --json'],
    effects: ["Resizes the selected terminal PTY; no shell command is executed."],
    output: "A confirmation containing the terminal ID without terminal contents.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect post-resize output.'],
    positionals: [{ name: "terminal-id", required: true }],
    options: [
      { name: "cols", flag: "--cols", kind: "integer", valueName: "N", min: 20, max: 500, description: "Columns, from 20 to 500" },
      { name: "rows", flag: "--rows", kind: "integer", valueName: "N", min: 5, max: 200, description: "Rows, from 5 to 200" }
    ],
    async run(ctx, input) {
      const cols = optionInteger(input, "cols");
      const rows = optionInteger(input, "rows");
      if (cols === void 0 || rows === void 0) usage("--cols and --rows are required");
      const variables = { terminalId: requiredTerminalId(input), cols, rows };
      await (await ctx.client()).graphql(traceCliOperations.resizeTerminal, variables);
      ctx.output({ terminalId: variables.terminalId, resized: true }, "Resized");
    }
  }),
  defineCommand({
    path: ["terminal", "destroy"],
    description: "Destroy an existing managed terminal",
    examples: ['"$TRACE_CLI" terminal destroy <terminal-id> --json'],
    effects: ["Terminates the selected managed terminal and releases its ephemeral relay state."],
    output: "A destruction confirmation containing the terminal ID.",
    nextSteps: ['Run "$TRACE_CLI" terminal list --json to verify the terminal is gone.'],
    positionals: [{ name: "terminal-id", required: true }],
    async run(ctx, input) {
      const variables = { terminalId: requiredTerminalId(input) };
      await (await ctx.client()).graphql(traceCliOperations.destroyTerminal, variables);
      ctx.output({ terminalId: variables.terminalId, destroyed: true }, "Destroyed");
    }
  })
];

// src/commands/index.ts
var commands = [
  contextCommand,
  ...integrationCommands,
  channelListCommand,
  repoListCommand,
  ...sessionCommands,
  ...terminalCommands,
  artifactCommand
];
var commandGroups = [
  {
    name: "integration",
    description: "Discover, connect, and configure data providers for the current Trace app",
    workflow: [
      'Run "$TRACE_CLI" integration list --json to inspect the live provider catalog, connected accounts, and current app access.',
      'If the required account is missing, run "$TRACE_CLI" integration connect and have the user complete the returned OAuth link.',
      'Run "$TRACE_CLI" integration add with only the capabilities required by the app.',
      "Follow the integration and capability guides returned by integration list when writing the app's Node route.",
      'Run "$TRACE_CLI" integration list again to verify the final connection and app-access state.'
    ],
    examples: [
      '"$TRACE_CLI" integration list --json',
      '"$TRACE_CLI" integration add github --capabilities profile --identity viewer --json'
    ],
    notes: [
      "The current app is selected automatically from TRACE_SESSION_GROUP_ID; never ask for a binding UUID.",
      "Put provider requests in generated Node routes and have the browser call only same-origin /api routes.",
      "Do not call Trace GraphQL directly, expose credentials, accept SQL from the browser, or silently broaden capabilities.",
      "Viewer identity uses each viewer's account; shared and service identities require an explicit connection ID."
    ]
  },
  {
    name: "session",
    description: "Discover and control Trace AI sessions",
    workflow: [
      'Run "$TRACE_CLI" session list --json to find a session, or "$TRACE_CLI" context --json for the current one.',
      'Run "$TRACE_CLI" session get <session-id> --json to inspect its status and destination.',
      'Use "$TRACE_CLI" session events <session-id> --limit 50 --json to assess progress before intervening.',
      "Start, message, run, stop, or archive only when the requested action requires it."
    ],
    examples: [
      '"$TRACE_CLI" session list --json',
      '"$TRACE_CLI" session start "Implement the API tests" --json'
    ],
    notes: [
      "Read command help before lifecycle mutations; session operations change shared Trace state."
    ]
  },
  {
    name: "terminal",
    description: "Create and control authorized managed terminals",
    workflow: [
      'Run "$TRACE_CLI" terminal list --json to discover terminals in the current session.',
      'Run "$TRACE_CLI" terminal create --json only when a shared terminal is needed.',
      'Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter, then terminal capture, to run and inspect a command.',
      "Use terminal key only for its documented allowlisted keys; use terminal destroy when the terminal is no longer needed."
    ],
    examples: [
      '"$TRACE_CLI" terminal create --cols 120 --rows 30 --json',
      '"$TRACE_CLI" terminal send <terminal-id> "pnpm test" --enter --json',
      '"$TRACE_CLI" terminal capture <terminal-id> --plain --json'
    ],
    notes: [
      "Terminal input and output are ephemeral and are not stored in Trace events.",
      "Session context is only a default selector; the server authorizes every terminal operation."
    ]
  },
  {
    name: "channel",
    description: "Discover channels available to the session owner",
    workflow: [
      'Run "$TRACE_CLI" channel list --member-only --json to list eligible destinations.',
      'Choose a channel ID and pass it to "$TRACE_CLI" session start --channel <channel-id>.'
    ],
    examples: ['"$TRACE_CLI" channel list --member-only --json'],
    notes: ["Channels are the collaboration and session destination in Trace."]
  },
  {
    name: "repo",
    description: "Discover repositories in the current organization",
    workflow: [
      'Run "$TRACE_CLI" repo list --json to find a repository ID.',
      'Use the repository ID with a channel that has no linked repository: "$TRACE_CLI" session start --channel <channel-id> --repo <repo-id>.'
    ],
    examples: ['"$TRACE_CLI" repo list --json'],
    notes: ["Repositories support coding channels; they are not standalone session destinations."]
  },
  {
    name: "artifact",
    description: "Validate and upload immutable Trace artifacts",
    workflow: [
      "Use the required artifact skill to prepare and validate the source file or directory.",
      'Run "$TRACE_CLI" artifact push <type> <file-or-directory> --json once the artifact is ready.',
      "Keep the returned idempotency key for a safe retry if the upload fails."
    ],
    examples: ['"$TRACE_CLI" artifact push visual-plan docs/plan --key primary --json'],
    notes: [
      "Artifact types can impose additional validation; use the relevant artifact skill when instructed."
    ]
  }
];

// src/main.ts
assertCommandDefinitions(commands);
assertCommandGroups(commandGroups, commands);
function globalHelp() {
  const standalone = commands.filter((command) => command.path.length === 1);
  return [
    'Usage: "$TRACE_CLI" <command> [options]',
    "",
    "Command groups:",
    ...commandGroups.map((group) => `  ${group.name.padEnd(14)} ${group.description}`),
    ...standalone.length ? [
      "",
      "Standalone commands:",
      ...standalone.map(
        (command) => `  ${command.path.join(" ").padEnd(14)} ${command.description}`
      )
    ] : [],
    "",
    'Run "$TRACE_CLI" <group> --help to discover its subcommands.',
    "Add --json to any help command for machine-readable output.",
    "",
    "This command is available inside Trace-managed AI sessions."
  ].join("\n");
}
function writeHelp(command, group, json) {
  if (json) {
    const value = command ? { command: commandDescriptor(command) } : group ? { group: commandGroupDescriptor(group, commands) } : {
      groups: commandGroups.map((candidate) => ({
        name: candidate.name,
        description: candidate.description,
        usage: `"$TRACE_CLI" ${candidate.name} <command> [options]`
      })),
      commands: commands.filter((candidate) => candidate.path.length === 1).map(commandDescriptor),
      globalOptions: [{ flag: "--json", description: "Emit machine-readable JSON" }]
    };
    process.stdout.write(`${JSON.stringify(value)}
`);
    return;
  }
  process.stdout.write(
    `${command ? commandHelp(command) : group ? commandGroupHelp(group, commands) : globalHelp()}
`
  );
}
async function run(argv = process.argv.slice(2)) {
  const parsed = parseGlobalOptions(argv);
  const command = findCommand(commands, parsed.args);
  const group = commandGroups.find((candidate) => candidate.name === parsed.args[0]);
  if (argv.length === 0 || parsed.help || group && parsed.args.length === 1) {
    writeHelp(command, command ? void 0 : group, parsed.options.json);
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
