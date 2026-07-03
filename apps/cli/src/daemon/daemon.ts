import { format } from "node:util";
import type { Readable, Writable } from "node:stream";
import type { Event } from "@trace/gql";
import { handleOrgEvent, handleSessionEvent } from "@trace/client-core/headless";
import { readCliVersion } from "../version.js";
import {
  createClientRuntime,
  type ClientRuntime,
  type ConnectionState,
  type CreateClientRuntimeOptions,
} from "../runtime.js";
import {
  CHANNEL_EVENTS_SUBSCRIPTION,
  CHAT_EVENTS_SUBSCRIPTION,
  SESSION_EVENTS_SUBSCRIPTION,
} from "../documents.js";
import { promptSession, sendToChannel, startNewSession, stopSession } from "../mutations.js";
import { hydrateOrg } from "./hydrate.js";
import { PROTOCOL_VERSION, RPC_ERROR_CODES, RpcError, RpcServer } from "./rpc.js";
import { ScopeRegistry } from "./scope-registry.js";
import { channelSnapshots, repoSnapshots, sessionSnapshots, ticketSnapshots } from "./snapshots.js";

export interface DaemonOptions {
  serverUrl: string;
  /** Test seams; production defaults are process stdio and the real runtime. */
  input?: Readable;
  output?: Writable;
  createRuntime?: (options: CreateClientRuntimeOptions) => ClientRuntime;
  exit?: (code: number) => void;
}

/** stdout carries protocol frames exclusively; console output from any
 *  dependency (e.g. client-core's ws debug logging) must land on stderr. */
function redirectConsoleToStderr(): void {
  const toStderr = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `Missing required string param: ${key}`);
  }
  return value;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function runDaemon(options: DaemonOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const createRuntime = options.createRuntime ?? createClientRuntime;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  if (!options.input) {
    redirectConsoleToStderr();
  }

  let runtime: ClientRuntime | null = null;
  let scopes: ScopeRegistry | null = null;
  let orgId: string | null = null;
  let initialized = false;
  let shuttingDown = false;
  let connectionState: ConnectionState = "disconnected";

  const requireRuntime = (): ClientRuntime => {
    if (!runtime) {
      throw new RpcError(RPC_ERROR_CODES.NOT_INITIALIZED, "Daemon runtime is not running");
    }
    return runtime;
  };

  const buildScopeRegistry = (active: ClientRuntime, activeOrgId: string): ScopeRegistry =>
    new ScopeRegistry((scopeType, scopeId) => {
      const handleEvent =
        scopeType === "session"
          ? (event: Event & { id: string }) => handleSessionEvent(scopeId, event)
          : (event: Event) => handleOrgEvent(event);
      const { document, variables, field } =
        scopeType === "session"
          ? {
              document: SESSION_EVENTS_SUBSCRIPTION,
              variables: { sessionId: scopeId, organizationId: activeOrgId },
              field: "sessionEvents",
            }
          : scopeType === "channel"
            ? {
                document: CHANNEL_EVENTS_SUBSCRIPTION,
                variables: { channelId: scopeId, organizationId: activeOrgId },
                field: "channelEvents",
              }
            : scopeType === "chat"
              ? {
                  document: CHAT_EVENTS_SUBSCRIPTION,
                  variables: { chatId: scopeId },
                  field: "chatEvents",
                }
              : (() => {
                  throw new RpcError(
                    RPC_ERROR_CODES.INVALID_PARAMS,
                    `Unsupported scopeType: ${scopeType}`,
                  );
                })();
      const subscription = active.gql.subscription(document, variables).subscribe((result) => {
        if (result.error) {
          process.stderr.write(`[daemon] ${field} subscription error: ${result.error.message}\n`);
        }
        const event = (result.data as Record<string, Event & { id: string }> | undefined)?.[field];
        if (event) handleEvent(event);
      });
      return () => subscription.unsubscribe();
    });

  const startRuntime = async (): Promise<void> => {
    const next = createRuntime({
      serverUrl: options.serverUrl,
      onConnectionChange: (state) => {
        connectionState = state;
        rpc.notify("connection/state", { state });
      },
    });
    try {
      await next.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await next.dispose().catch(() => {});
      throw new RpcError(RPC_ERROR_CODES.UNAUTHENTICATED, message);
    }
    runtime = next;
    const auth = next.stores.auth.getState();
    orgId = auth.activeOrgId;
    if (!orgId) {
      throw new RpcError(RPC_ERROR_CODES.UNAUTHENTICATED, "No active organization");
    }
    await hydrateOrg(next, orgId);
    scopes = buildScopeRegistry(next, orgId);
  };

  const dispose = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      scopes?.disposeAll();
      await runtime?.dispose();
    } catch (error) {
      process.stderr.write(`[daemon] dispose failed: ${String(error)}\n`);
    }
  };

  const rpc = new RpcServer({
    input,
    output,
    guard: (method) => {
      if (!initialized && method !== "initialize") {
        return new RpcError(
          RPC_ERROR_CODES.NOT_INITIALIZED,
          "Daemon not initialized — call initialize first",
        );
      }
      return null;
    },
    onEnd: () => {
      // Editor died (stdin EOF): same clean path as shutdown.
      void dispose().then(() => exit(0));
    },
  });

  const currentOrg = () => {
    const auth = requireRuntime().stores.auth.getState();
    const membership = auth.orgMemberships.find((m) => m.organizationId === auth.activeOrgId);
    return membership?.organization ?? null;
  };

  rpc.register("initialize", async (params) => {
    if (initialized) {
      throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, "Already initialized");
    }
    const requested = params.protocolVersion;
    if (requested !== PROTOCOL_VERSION) {
      throw new RpcError(
        RPC_ERROR_CODES.VERSION_MISMATCH,
        `Unsupported protocol version ${String(requested)}; this daemon speaks ${PROTOCOL_VERSION}`,
        { expected: PROTOCOL_VERSION, received: requested ?? null },
      );
    }

    await startRuntime();
    initialized = true;
    const auth = requireRuntime().stores.auth.getState();
    const activeOrg = currentOrg();
    return {
      cliVersion: readCliVersion(),
      protocolVersion: PROTOCOL_VERSION,
      user: auth.user
        ? { id: auth.user.id, name: auth.user.name ?? null, email: auth.user.email ?? null }
        : null,
      org: activeOrg ? { id: activeOrg.id, name: activeOrg.name } : null,
      connectionState,
    };
  });

  rpc.register("shutdown", () => {
    // Respond first, then tear down and exit once the reply has flushed.
    setImmediate(() => {
      void dispose().then(() => exit(0));
    });
    return null;
  });

  // --- snapshots: answered from the entity store, never from GraphQL ---

  rpc.register("sessions/list", () => ({
    sessions: sessionSnapshots(requireRuntime().stores.entity.getState()),
  }));
  rpc.register("channels/list", () => ({
    channels: channelSnapshots(requireRuntime().stores.entity.getState()),
  }));
  rpc.register("tickets/list", () => ({
    tickets: ticketSnapshots(requireRuntime().stores.entity.getState()),
  }));
  rpc.register("repos/list", () => ({
    repos: repoSnapshots(requireRuntime().stores.entity.getState()),
  }));
  rpc.register("orgs/list", () => {
    const auth = requireRuntime().stores.auth.getState();
    return {
      orgs: auth.orgMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
        active: membership.organizationId === auth.activeOrgId,
      })),
    };
  });

  rpc.register("org/switch", async (params) => {
    const requested = requireString(params, "org");
    const active = requireRuntime();
    const auth = active.stores.auth.getState();
    const membership = auth.orgMemberships.find(
      (m) =>
        m.organization.id === requested ||
        m.organization.name.toLowerCase() === requested.toLowerCase(),
    );
    if (!membership) {
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No organization "${requested}"`);
    }
    if (membership.organizationId !== auth.activeOrgId) {
      // Tear down the old org's world, persist the switch, rebuild.
      scopes?.disposeAll();
      scopes = null;
      auth.setActiveOrg(membership.organizationId);
      active.stores.entity.getState().reset();
      await active.dispose();
      runtime = null;
      await startRuntime();
    }
    const org = currentOrg();
    return { org: org ? { id: org.id, name: org.name } : null };
  });

  // --- viewport scopes ---

  rpc.register("scope/subscribe", (params) => {
    const scopeType = requireString(params, "scopeType");
    const scopeId = requireString(params, "scopeId");
    if (!scopes) throw new RpcError(RPC_ERROR_CODES.NOT_INITIALIZED, "No scope registry");
    return { count: scopes.subscribe(scopeType, scopeId) };
  });
  rpc.register("scope/unsubscribe", (params) => {
    const scopeType = requireString(params, "scopeType");
    const scopeId = requireString(params, "scopeId");
    if (!scopes) throw new RpcError(RPC_ERROR_CODES.NOT_INITIALIZED, "No scope registry");
    return { count: scopes.unsubscribe(scopeType, scopeId) };
  });

  // --- actions: fire-and-forget; store updates arrive via subscriptions ---

  rpc.register("session/prompt", async (params) => {
    const sessionId = requireString(params, "sessionId");
    const text = requireString(params, "text");
    const active = requireRuntime();
    const session = active.stores.entity.getState().sessions[sessionId];
    const result = await promptSession(
      active.gql,
      { id: sessionId, agentStatus: session?.agentStatus ?? "not_started" },
      text,
    );
    return { accepted: true, id: result.id, queued: result.queued };
  });

  rpc.register("session/create", async (params) => {
    const active = requireRuntime();
    const session = await startNewSession(active.gql, {
      repoId: optionalString(params, "repoId"),
      branch: optionalString(params, "branch"),
      tool: optionalString(params, "tool"),
      model: optionalString(params, "model"),
      prompt: optionalString(params, "prompt"),
    });
    return { accepted: true, id: session.id, sessionGroupId: session.sessionGroupId ?? null };
  });

  rpc.register("session/stop", async (params) => {
    const sessionId = requireString(params, "sessionId");
    const stopped = await stopSession(requireRuntime().gql, sessionId);
    return { accepted: true, id: stopped.id };
  });

  rpc.register("channel/send", async (params) => {
    const channelId = requireString(params, "channelId");
    const text = requireString(params, "text");
    const active = requireRuntime();
    const channel = active.stores.entity.getState().channels[channelId];
    if (!channel) {
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `Unknown channel: ${channelId}`);
    }
    const message = await sendToChannel(active.gql, { id: channelId, type: channel.type }, text);
    return { accepted: true, id: message.id };
  });

  // Ticket 12 registers the normalized-delta notifications here.
  return new Promise(() => {});
}
