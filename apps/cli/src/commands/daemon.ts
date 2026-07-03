import type { Command } from "commander";
import { resolveServerUrl } from "../config.js";
import { runDaemon } from "../daemon/daemon.js";

export function registerDaemonCommand(program: Command): void {
  program
    .command("daemon")
    .description("Run the editor daemon (NDJSON JSON-RPC over stdio)")
    .requiredOption("--stdio", "speak the protocol over stdin/stdout (required)")
    .action(async (_opts: { stdio: boolean }, cmd: Command) => {
      const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
      await runDaemon({ serverUrl });
    });
}
