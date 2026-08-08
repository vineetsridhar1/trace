#!/usr/bin/env node
import { artifactCommand } from "./commands/artifact.js";
import { contextCommand } from "./commands/context.js";
import { sessionCommands } from "./commands/session.js";
import { CliError, ExitCode } from "./errors.js";
import { createCommandContext, type Command } from "./runtime.js";

export const commands: readonly Command[] = [
  contextCommand,
  ...sessionCommands,
  artifactCommand,
];

function help(): string {
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
  const wantsJson = argv.includes("--json");
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${help()}\n`);
    return ExitCode.success;
  }

  try {
    const ctx = await createCommandContext(argv);
    const command = commands.find((candidate) =>
      candidate.path.every((part, index) => ctx.args[index] === part),
    );
    if (!command)
      throw new CliError(
        `Unknown command: ${ctx.args.slice(0, 2).join(" ")}`,
        ExitCode.usage,
        "usage",
      );
    await command.run(ctx);
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
    process.stderr.write(wantsJson ? `${JSON.stringify(value)}\n` : `trace: ${cliError.message}\n`);
    return cliError.exitCode;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
