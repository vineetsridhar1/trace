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

// src/commands/auth.ts
import { randomUUID as randomUUID3 } from "node:crypto";

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

// src/config.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";

// src/credential-store.ts
import { spawn } from "node:child_process";
var KEYCHAIN_SERVICE = "org.gettrace.cli";
async function run(command, args, input) {
  return new Promise((resolve2) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    let stdout2 = "";
    child.stdout.on("data", (chunk) => {
      stdout2 += chunk.toString();
    });
    child.on("error", () => resolve2({ ok: false, stdout: "" }));
    child.on("close", (code) => resolve2({ ok: code === 0, stdout: stdout2 }));
    child.stdin.end(input === void 0 ? void 0 : `${input}
`);
  });
}
async function readOsCredential(serverUrl) {
  const result = process.platform === "darwin" ? await run("security", [
    "find-generic-password",
    "-a",
    serverUrl,
    "-s",
    KEYCHAIN_SERVICE,
    "-w"
  ]) : process.platform === "linux" ? await run("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "server", serverUrl]) : { ok: false, stdout: "" };
  const secret = result.stdout.trim();
  return result.ok && secret ? secret : null;
}
async function writeOsCredential(serverUrl, token) {
  const result = process.platform === "darwin" ? await run(
    "security",
    ["add-generic-password", "-U", "-a", serverUrl, "-s", KEYCHAIN_SERVICE, "-w"],
    token
  ) : process.platform === "linux" ? await run(
    "secret-tool",
    [
      "store",
      "--label",
      "Trace CLI credential",
      "service",
      KEYCHAIN_SERVICE,
      "server",
      serverUrl
    ],
    token
  ) : { ok: false, stdout: "" };
  return result.ok;
}
async function deleteOsCredential(serverUrl) {
  if (process.platform === "darwin") {
    await run("security", ["delete-generic-password", "-a", serverUrl, "-s", KEYCHAIN_SERVICE]);
  } else if (process.platform === "linux") {
    await run("secret-tool", ["clear", "service", KEYCHAIN_SERVICE, "server", serverUrl]);
  }
}

// src/config.ts
var DEFAULT_SERVER = "https://app.gettrace.org";
function configPath(env = process.env) {
  const root = env.TRACE_CONFIG_DIR?.trim() || join2(homedir(), ".config", "trace");
  return join2(root, "config.json");
}
function credentialsPath(env = process.env) {
  return join2(dirname2(configPath(env)), "credentials.json");
}
async function readConfig(env = process.env) {
  try {
    const value = JSON.parse(await readFile(configPath(env), "utf8"));
    return {
      serverUrl: normalizeServerUrl(value.serverUrl || DEFAULT_SERVER),
      activeOrganizationId: value.activeOrganizationId,
      deviceId: value.deviceId,
      deviceName: value.deviceName,
      installId: typeof value.installId === "string" ? value.installId : randomUUID2()
    };
  } catch {
    return { serverUrl: DEFAULT_SERVER, installId: randomUUID2() };
  }
}
async function writeProtected(path, contents) {
  await mkdir(dirname2(path), { recursive: true, mode: 448 });
  await chmod(dirname2(path), 448);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode: 384 });
  await chmod(temporary, 384);
  await rename(temporary, path);
}
async function writeConfig(config, env = process.env) {
  await writeProtected(configPath(env), `${JSON.stringify(config, null, 2)}
`);
}
async function readStoredCredential(serverUrl, env = process.env) {
  const osCredential = env.TRACE_CREDENTIAL_STORE === "file" ? null : await readOsCredential(normalizeServerUrl(serverUrl));
  if (osCredential) return osCredential;
  try {
    const credentials = JSON.parse(await readFile(credentialsPath(env), "utf8"));
    const value = credentials[normalizeServerUrl(serverUrl)];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}
async function writeStoredCredential(serverUrl, token, env = process.env) {
  if (env.TRACE_CREDENTIAL_STORE !== "file" && await writeOsCredential(normalizeServerUrl(serverUrl), token)) {
    return;
  }
  let credentials = {};
  try {
    const parsed = JSON.parse(await readFile(credentialsPath(env), "utf8"));
    credentials = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry) => typeof entry[1] === "string"
      )
    );
  } catch {
  }
  credentials[normalizeServerUrl(serverUrl)] = token;
  await writeProtected(credentialsPath(env), `${JSON.stringify(credentials, null, 2)}
`);
}
async function deleteStoredCredential(serverUrl, env = process.env) {
  if (env.TRACE_CREDENTIAL_STORE !== "file") {
    await deleteOsCredential(normalizeServerUrl(serverUrl));
  }
  try {
    const parsed = JSON.parse(await readFile(credentialsPath(env), "utf8"));
    const credentials = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry) => entry[0] !== normalizeServerUrl(serverUrl) && typeof entry[1] === "string"
      )
    );
    await writeProtected(credentialsPath(env), `${JSON.stringify(credentials, null, 2)}
`);
  } catch {
  }
}
function normalizeServerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError("Server URL is invalid", ExitCode.validation, "validation");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError(
      "Server URL must use http:// or https://",
      ExitCode.validation,
      "validation"
    );
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

// src/runtime.ts
import { hostname } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
function parseGlobalOptions(argv) {
  const args = [];
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") options.json = true;
    else if (value === "--server")
      options.server = argv[++index] || usage("--server requires a URL");
    else if (value === "--org" || value === "--organization") {
      options.organizationId = argv[++index] || usage(`${value} requires an ID`);
    } else args.push(value ?? "");
  }
  return { args, options };
}
function defaultDeviceName() {
  return `Trace CLI on ${hostname()}`;
}
async function promptPairingCode() {
  if (!stdin.isTTY) usage("Pairing code is required when stdin is not interactive");
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return (await readline.question("Pairing code: ")).trim();
  } finally {
    readline.close();
  }
}
async function createCommandContext(argv, env = process.env) {
  const parsed = parseGlobalOptions(argv);
  const config = await readConfig(env);
  const managedServerUrl = env.TRACE_SERVER_URL || env.TRACE_API_URL;
  if (managedServerUrl) config.serverUrl = normalizeServerUrl(managedServerUrl);
  if (parsed.options.server) config.serverUrl = normalizeServerUrl(parsed.options.server);
  if (parsed.options.organizationId) config.activeOrganizationId = parsed.options.organizationId;
  return {
    args: parsed.args,
    options: parsed.options,
    config,
    env,
    output(value, human) {
      process.stdout.write(parsed.options.json ? `${JSON.stringify(value)}
` : `${human}
`);
    },
    async client(requireOrganization = true) {
      const token = env.TRACE_INVOCATION_TOKEN || await readStoredCredential(config.serverUrl, env);
      if (!token) {
        throw new CliError(
          "Not authenticated. Run `trace auth pair`.",
          ExitCode.authentication,
          "authentication"
        );
      }
      const organizationId = parsed.options.organizationId || env.TRACE_ORGANIZATION_ID || config.activeOrganizationId;
      if (requireOrganization && !organizationId) {
        usage("Organization is required; pass --org or pair the CLI first");
      }
      return new TraceClient(config.serverUrl, token, organizationId);
    }
  };
}

// src/commands/auth.ts
var authCommands = [
  {
    path: ["auth", "pair"],
    usage: "trace auth pair [pairing-code] [--server URL] [--name NAME] [--json]",
    description: "Pair this CLI with a signed-in Trace account",
    async run(ctx) {
      let code;
      let deviceName = defaultDeviceName();
      for (let index = 2; index < ctx.args.length; index += 1) {
        if (ctx.args[index] === "--name") {
          deviceName = ctx.args[++index] || usage("--name requires a value");
        } else if (!code) {
          code = ctx.args[index];
        } else {
          usage(`Unexpected argument: ${ctx.args[index]}`);
        }
      }
      code = code?.trim() || await promptPairingCode();
      if (!code) usage("Pairing code is required");
      const anonymous = new TraceClient(ctx.config.serverUrl, "");
      const result = await anonymous.http("/auth/client/pair", {
        method: "POST",
        body: {
          pairingToken: code,
          installId: ctx.config.installId || randomUUID3(),
          deviceName,
          appVersion: "0.0.2"
        }
      });
      await writeStoredCredential(ctx.config.serverUrl, result.token, ctx.env);
      await writeConfig(
        {
          ...ctx.config,
          deviceId: result.deviceId,
          deviceName,
          activeOrganizationId: result.organizationId
        },
        ctx.env
      );
      ctx.output(
        {
          authenticated: true,
          serverUrl: ctx.config.serverUrl,
          organizationId: result.organizationId,
          deviceId: result.deviceId,
          deviceName
        },
        `Paired ${deviceName} with ${ctx.config.serverUrl}`
      );
    }
  },
  {
    path: ["auth", "status"],
    usage: "trace auth status [--json]",
    description: "Show the active authentication status",
    async run(ctx) {
      const client = await ctx.client(false);
      const result = await client.http("/auth/me");
      const mode = ctx.env.TRACE_INVOCATION_TOKEN ? "session" : "human";
      ctx.output(
        {
          authenticated: true,
          mode,
          serverUrl: ctx.config.serverUrl,
          organizationId: client.organizationId ?? null,
          user: result.user
        },
        `${result.user.name ?? result.user.email} (${mode} authentication)
Server: ${ctx.config.serverUrl}`
      );
    }
  },
  {
    path: ["auth", "logout"],
    usage: "trace auth logout [--json]",
    description: "Revoke this CLI device and remove its local credential",
    async run(ctx) {
      if (ctx.env.TRACE_INVOCATION_TOKEN) {
        throw new CliError(
          "Trace-managed session authentication cannot be logged out from inside the session",
          ExitCode.authorization,
          "authorization"
        );
      }
      const client = await ctx.client(false);
      await client.http("/auth/logout", { method: "POST", body: {} });
      await deleteStoredCredential(ctx.config.serverUrl, ctx.env);
      ctx.output({ authenticated: false, revoked: true }, "Logged out and revoked this CLI device");
    }
  }
];

// src/commands/context.ts
var contextCommand = {
  path: ["context"],
  usage: "trace context [--json]",
  description: "Show the selected Trace server, organization, and session context",
  async run(ctx) {
    const value = {
      serverUrl: ctx.env.TRACE_SERVER_URL || ctx.env.TRACE_API_URL || ctx.config.serverUrl,
      organizationId: ctx.options.organizationId || ctx.env.TRACE_ORGANIZATION_ID || ctx.config.activeOrganizationId || null,
      sessionId: ctx.env.TRACE_SESSION_ID || null,
      sessionGroupId: ctx.env.TRACE_SESSION_GROUP_ID || null,
      authentication: ctx.env.TRACE_INVOCATION_TOKEN ? "session" : "human"
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

// src/commands/org.ts
var orgCommands = [
  {
    path: ["org", "list"],
    usage: "trace org list [--json]",
    description: "List organizations available to the authenticated human",
    async run(ctx) {
      const client = await ctx.client(false);
      const result = await client.http("/auth/me");
      const organizations = result.user.orgMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
        active: membership.organizationId === client.organizationId
      }));
      ctx.output(
        { organizations },
        organizations.length ? organizations.map((org) => `${org.active ? "*" : " "} ${org.id}	${org.name}	${org.role}`).join("\n") : "No organizations found"
      );
    }
  }
];

// src/commands/session.ts
import { randomUUID as randomUUID4 } from "node:crypto";
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
    path: ["session", "list"],
    usage: "trace session list [--org ID] [--json]",
    description: "List sessions in an organization",
    async run(ctx) {
      const client = await ctx.client();
      const organizationId = client.organizationId ?? usage("Organization is required");
      const result = await client.graphql(
        `query TraceCliSessions($organizationId: ID!) {
          sessions(organizationId: $organizationId) { ${SESSION_FIELDS} }
        }`,
        { organizationId }
      );
      ctx.output(
        { sessions: result.sessions },
        result.sessions.length ? result.sessions.map((session) => `${session.id}	${session.agentStatus}	${session.name}`).join("\n") : "No sessions found"
      );
    }
  },
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
    path: ["session", "start"],
    usage: "trace session start [prompt] [--channel ID|--group ID|--repo ID] [--json]",
    description: "Start a session through the existing Trace session service",
    async run(ctx) {
      const input = {};
      const promptParts = [];
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
      const result = await client.graphql(
        `mutation TraceCliStartSession($input: StartSessionInput!) {
          startSession(input: $input) { ${SESSION_FIELDS} }
        }`,
        { input }
      );
      ctx.output({ session: result.startSession }, printSession(result.startSession));
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
        { sessionId: id, text, clientMutationId: randomUUID4() }
      );
      ctx.output(
        { event: result.sendSessionMessage },
        `Sent message (${result.sendSessionMessage.id})`
      );
    }
  },
  {
    path: ["session", "run"],
    usage: "trace session run [session-id] [prompt] [--json]",
    description: "Run or resume a session",
    async run(ctx) {
      const id = sessionId(ctx);
      const prompt = ctx.args.slice(3).join(" ").trim() || null;
      const client = await ctx.client();
      const result = await client.graphql(
        `mutation TraceCliRunSession($id: ID!, $prompt: String) {
          runSession(id: $id, prompt: $prompt) { ${SESSION_FIELDS} }
        }`,
        { id, prompt }
      );
      ctx.output({ session: result.runSession }, printSession(result.runSession));
    }
  },
  {
    path: ["session", "stop"],
    usage: "trace session stop [session-id] [--json]",
    description: "Stop a running session",
    async run(ctx) {
      const id = sessionId(ctx);
      const client = await ctx.client();
      const result = await client.graphql(
        `mutation TraceCliStopSession($id: ID!) {
          terminateSession(id: $id) { ${SESSION_FIELDS} }
        }`,
        { id }
      );
      ctx.output({ session: result.terminateSession }, printSession(result.terminateSession));
    }
  },
  {
    path: ["session", "archive"],
    usage: "trace session archive [session-id] [--json]",
    description: "Archive the session's group",
    async run(ctx) {
      const session = await getSession(ctx, sessionId(ctx));
      const groupId = session.sessionGroupId || usage("Session has no group to archive");
      const client = await ctx.client();
      const result = await client.graphql(
        `mutation TraceCliArchiveSession($id: ID!) {
          archiveSessionGroup(id: $id) { id archived }
        }`,
        { id: groupId }
      );
      ctx.output({ sessionGroup: result.archiveSessionGroup }, `Archived session group ${groupId}`);
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

// src/main.ts
var commands = [
  ...authCommands,
  contextCommand,
  ...orgCommands,
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
    "Global options: --server URL, --org ID, --json",
    "",
    "Additional command families register by exporting Command objects and adding them to this registry."
  ].join("\n");
}
async function run2(argv = process.argv.slice(2)) {
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
  process.exitCode = await run2();
}
export {
  commands,
  run2 as run
};
