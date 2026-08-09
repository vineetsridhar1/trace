import type { CommandDefinition } from "../../runtime.js";
import { sessionArchiveCommand } from "./archive.js";
import { sessionEventsCommand } from "./events.js";
import { sessionGetCommand } from "./get.js";
import { sessionListCommand } from "./list.js";
import { sessionRunCommand } from "./run.js";
import { sessionSendCommand } from "./send.js";
import { sessionStartCommand } from "./start.js";
import { sessionStopCommand } from "./stop.js";

export const sessionCommands: readonly CommandDefinition[] = [
  sessionListCommand,
  sessionGetCommand,
  sessionStartCommand,
  sessionSendCommand,
  sessionRunCommand,
  sessionStopCommand,
  sessionArchiveCommand,
  sessionEventsCommand,
];
