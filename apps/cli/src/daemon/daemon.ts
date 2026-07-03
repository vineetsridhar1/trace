import { format } from "node:util";
import type { Readable, Writable } from "node:stream";
import { readCliVersion } from "../version.js";
import {
  createClientRuntime,
  type ClientRuntime,
  type ConnectionState,
  type CreateClientRuntimeOptions,
} from "../runtime.js";
import { PROTOCOL_VERSION, RPC_ERROR_CODES, RpcError, RpcServer } from "./rpc.js";

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

export async function runDaemon(options: DaemonOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const createRuntime = options.createRuntime ?? createClientRuntime;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  if (!options.input) {
    redirectConsoleToStderr();
  }

  let runtime: ClientRuntime | null = null;
  let initialized = false;
  let shuttingDown = false;
  let connectionState: ConnectionState = "disconnected";

  const dispose = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
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

    runtime = createRuntime({
      serverUrl: options.serverUrl,
      onConnectionChange: (state) => {
        connectionState = state;
        rpc.notify("connection/state", { state });
      },
    });
    try {
      await runtime.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await runtime.dispose().catch(() => {});
      runtime = null;
      throw new RpcError(RPC_ERROR_CODES.UNAUTHENTICATED, message);
    }

    initialized = true;
    const auth = runtime.stores.auth.getState();
    const activeOrg =
      auth.orgMemberships.find((m) => m.organizationId === auth.activeOrgId)?.organization ?? null;
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

  // Tickets 11/12 register snapshot, scope, and action methods here.
  return new Promise(() => {});
}
