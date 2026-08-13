import type { CommandDefinition } from "../../runtime.js";
import { sessionArchiveCommand } from "./archive.js";
import { sessionLinkPrCommand } from "./link-pr.js";
import { sessionEventsCommand } from "./events.js";
import { sessionGetCommand } from "./get.js";
import { sessionListCommand } from "./list.js";
import { sessionRunCommand } from "./run.js";
import { sessionSendCommand } from "./send.js";
import { sessionStartCommand } from "./start.js";
import { sessionConvertCommand } from "./convert.js";
import { sessionStopCommand } from "./stop.js";

export const sessionCommands: readonly CommandDefinition[] = [
  sessionListCommand,
  sessionGetCommand,
  sessionStartCommand,
  sessionConvertCommand,
  sessionSendCommand,
  sessionRunCommand,
  sessionStopCommand,
  sessionArchiveCommand,
  sessionLinkPrCommand,
  sessionEventsCommand,
];
