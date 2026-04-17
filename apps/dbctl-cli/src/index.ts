import path from "path";
import { fileURLToPath } from "url";
import {
  createDbctlClient,
  createDefaultDbctlSocketPath,
  ensureDbctlDaemonRunning,
} from "@trace/dbctl-core";
import type { DbctlRequest, DbctlRuntimeKind } from "@trace/dbctl-protocol";

function parseRuntime(arg: string | undefined): DbctlRuntimeKind {
  return arg === "cloud" ? "cloud" : "local";
}

function usage(): never {
  console.error("Usage: dbctl <ensure|reset|destroy|status|logs|gc> [worktreePath] [--runtime local|cloud]");
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runtimeFlagIndex = args.indexOf("--runtime");
  const runtime = runtimeFlagIndex >= 0 ? parseRuntime(args[runtimeFlagIndex + 1]) : "local";
  if (runtimeFlagIndex >= 0) {
    args.splice(runtimeFlagIndex, 2);
  }

  const [kind, worktreePath] = args;
  if (!kind) usage();

  const socketPath =
    process.env.TRACE_DBCTL_SOCKET_PATH ?? createDefaultDbctlSocketPath(runtime);
  const daemonScriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dbctl-daemon/dist/index.js",
  );
  await ensureDbctlDaemonRunning({
    daemonScriptPath,
    runtime,
    socketPath,
  });
  const client = createDbctlClient(socketPath);

  let request: DbctlRequest;
  switch (kind) {
    case "ensure":
    case "reset":
      if (!worktreePath) usage();
      request = {
        kind,
        runtime,
        worktreePath: path.resolve(worktreePath),
      };
      break;
    case "destroy":
    case "status":
    case "logs":
      if (!worktreePath) usage();
      request = {
        kind,
        worktreePath: path.resolve(worktreePath),
      };
      break;
    case "gc":
      request = { kind: "gc" };
      break;
    default:
      usage();
  }

  const response = await client.send(request);
  process.stdout.write(JSON.stringify(response, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
