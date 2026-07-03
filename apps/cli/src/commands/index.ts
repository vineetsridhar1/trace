import type { Command } from "commander";
import { registerAuthCommands } from "./auth.js";
import { registerChannelCommands } from "./channels.js";
import { registerOrgCommands } from "./org.js";
import { registerSendCommand } from "./send.js";
import { registerSessionCommands } from "./sessions.js";
import { registerTicketCommands } from "./tickets.js";

// One module per command group lives in this directory (auth, org, sessions, …).
// Each exports a register function listed here so index.ts stays a thin bootstrap.
const commandGroups: ReadonlyArray<(program: Command) => void> = [
  registerAuthCommands,
  registerOrgCommands,
  registerSessionCommands,
  registerChannelCommands,
  registerTicketCommands,
  registerSendCommand,
];

export function registerCommands(program: Command): void {
  for (const registerGroup of commandGroups) {
    registerGroup(program);
  }
}
