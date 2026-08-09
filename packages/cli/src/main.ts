#!/usr/bin/env node
import { commandGroups, commands } from "./commands/index.js";
import { CliError, ExitCode } from "./errors.js";
import {
  assertCommandDefinitions,
  assertCommandGroups,
  commandGroupDescriptor,
  commandGroupHelp,
  commandDescriptor,
  commandHelp,
  createCommandContext,
  findCommand,
  parseCommandInput,
  parseGlobalOptions,
} from "./runtime.js";

assertCommandDefinitions(commands);
assertCommandGroups(commandGroups, commands);

function globalHelp(): string {
  const standalone = commands.filter((command) => command.path.length === 1);
  return [
    'Usage: "$TRACE_CLI" <command> [options]',
    "",
    "Command groups:",
    ...commandGroups.map((group) => `  ${group.name.padEnd(14)} ${group.description}`),
    ...(standalone.length
      ? [
          "",
          "Standalone commands:",
          ...standalone.map(
            (command) => `  ${command.path.join(" ").padEnd(14)} ${command.description}`,
          ),
        ]
      : []),
    "",
    'Run "$TRACE_CLI" <group> --help to discover its subcommands.',
    "Add --json to any help command for machine-readable output.",
    "",
    "This command is available inside Trace-managed AI sessions.",
  ].join("\n");
}

function writeHelp(
  command: (typeof commands)[number] | undefined,
  group: (typeof commandGroups)[number] | undefined,
  json: boolean,
): void {
  if (json) {
    const value = command
      ? { command: commandDescriptor(command) }
      : group
        ? { group: commandGroupDescriptor(group, commands) }
        : {
            groups: commandGroups.map((candidate) => ({
              name: candidate.name,
              description: candidate.description,
              usage: `"$TRACE_CLI" ${candidate.name} <command> [options]`,
            })),
            commands: commands
              .filter((candidate) => candidate.path.length === 1)
              .map(commandDescriptor),
            globalOptions: [{ flag: "--json", description: "Emit machine-readable JSON" }],
          };
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  process.stdout.write(
    `${command ? commandHelp(command) : group ? commandGroupHelp(group, commands) : globalHelp()}\n`,
  );
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseGlobalOptions(argv);
  const command = findCommand(commands, parsed.args);
  const group = commandGroups.find((candidate) => candidate.name === parsed.args[0]);
  if (argv.length === 0 || parsed.help || (group && parsed.args.length === 1)) {
    writeHelp(command, command ? undefined : group, parsed.options.json);
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
