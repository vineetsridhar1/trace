import type { Command } from "commander";

// One module per command group lives in this directory (auth, org, sessions, …).
// Each exports a register function listed here so index.ts stays a thin bootstrap.
const commandGroups: ReadonlyArray<(program: Command) => void> = [];

export function registerCommands(program: Command): void {
  for (const registerGroup of commandGroups) {
    registerGroup(program);
  }
}
