#!/usr/bin/env node
import { commands } from "./commands/index.js";
import { CliError, ExitCode } from "./errors.js";
import {
  assertCommandDefinitions,
  commandDescriptor,
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

function writeHelp(command: (typeof commands)[number] | undefined, json: boolean): void {
  if (json) {
    const value = command
      ? { command: commandDescriptor(command) }
      : {
          commands: commands.map(commandDescriptor),
          globalOptions: [{ flag: "--json", description: "Emit machine-readable JSON" }],
        };
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  process.stdout.write(`${command ? commandHelp(command) : globalHelp()}\n`);
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
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
        "usage",
      );
    }
    const input = parseCommandInput(command, parsed.args);
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
