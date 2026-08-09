#!/usr/bin/env node
import { commands } from "./commands/index.js";
import { CliError, ExitCode } from "./errors.js";
import {
  assertCommandDefinitions,
  commandHelp,
  createCommandContext,
  findCommand,
  parseCommandInput,
  parseGlobalOptions,
} from "./runtime.js";

assertCommandDefinitions(commands);

function globalHelp(): string {
  return [
    "Usage: trace <command> [options]",
    "",
    "Commands:",
    ...commands.map((command) => `  ${command.path.join(" ").padEnd(22)} ${command.description}`),
    "",
    "Global option: --json",
    "",
    "This command is available inside Trace-managed AI sessions.",
  ].join("\n");
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseGlobalOptions(argv);
  const wantsHelp = parsed.args.includes("--help") || parsed.args.includes("-h");
  const commandArgs = parsed.args.filter((value) => value !== "--help" && value !== "-h");
  const command = findCommand(commands, commandArgs);
  if (argv.length === 0 || wantsHelp) {
    process.stdout.write(`${command ? commandHelp(command) : globalHelp()}\n`);
    return ExitCode.success;
  }

  try {
    if (!command) {
      throw new CliError(
        `Unknown command: ${commandArgs.slice(0, 2).join(" ")}`,
        ExitCode.usage,
        "usage",
      );
    }
    const input = parseCommandInput(command, commandArgs);
    const ctx = createCommandContext(parsed.options);
    await command.run(ctx, input);
    return ExitCode.success;
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(
            error instanceof Error ? error.message : "Unknown error",
            ExitCode.server,
            "server",
          );
    const value = { error: { category: cliError.category, message: cliError.message } };
    process.stderr.write(
      parsed.options.json ? `${JSON.stringify(value)}\n` : `trace: ${cliError.message}\n`,
    );
    return cliError.exitCode;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
