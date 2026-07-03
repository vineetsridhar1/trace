#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerCommands } from "./commands/index.js";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command();

program
  .name("trace")
  .description("Trace client for the terminal")
  .version(version)
  .option("--server <url>", "Trace server URL (overrides TRACE_SERVER and stored config)")
  .option("--json", "emit machine-readable JSON output");

registerCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
