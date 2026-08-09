import type { CommandDefinition } from "../runtime.js";
import { artifactCommand } from "./artifact.js";
import { channelListCommand } from "./channel/list.js";
import { contextCommand } from "./context.js";
import { integrationCommands } from "./integration/index.js";
import { projectListCommand } from "./project/list.js";
import { repoListCommand } from "./repo/list.js";
import { sessionCommands } from "./session/index.js";

export const commands: readonly CommandDefinition[] = [
  contextCommand,
  ...integrationCommands,
  channelListCommand,
  repoListCommand,
  projectListCommand,
  ...sessionCommands,
  artifactCommand,
];
