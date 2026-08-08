const GLOBAL_COMMANDS = new Set(["close-all", "kill-all", "list", "show"]);

export function guardedPlaywrightArgs(
  args: string[],
  env: NodeJS.ProcessEnv,
): { rawExecutable: string; args: string[] } {
  const session = env.PLAYWRIGHT_CLI_SESSION?.trim();
  const config = env.PLAYWRIGHT_CLI_CONFIG?.trim();
  if (!session) throw new Error("PLAYWRIGHT_CLI_SESSION is required");
  if (!/^trace-[a-f0-9]{32}$/.test(session) && session !== "trace-image-smoke") {
    throw new Error("PLAYWRIGHT_CLI_SESSION is invalid");
  }

  let command: string | null = null;
  for (const arg of args) {
    if (
      arg === "-s" ||
      arg === "--session" ||
      arg.startsWith("-s=") ||
      arg.startsWith("--session=")
    ) {
      throw new Error("Playwright session selection is managed by Trace");
    }
    if (arg === "--config") {
      throw new Error("Pass the Trace config as --config=$PLAYWRIGHT_CLI_CONFIG");
    }
    if (arg.startsWith("--config=")) {
      if (!config || arg.slice("--config=".length) !== config) {
        throw new Error("Playwright config selection is managed by Trace");
      }
      continue;
    }
    if (!arg.startsWith("-") && command === null) command = arg;
  }

  if (command && GLOBAL_COMMANDS.has(command)) {
    throw new Error(`Playwright command ${command} is unavailable in Trace sessions`);
  }

  return {
    rawExecutable: env.TRACE_PLAYWRIGHT_CLI_RAW ?? "/usr/local/bin/playwright-cli-raw",
    args: [`-s=${session}`, ...args],
  };
}
