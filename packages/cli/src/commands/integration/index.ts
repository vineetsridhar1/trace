import { integrationAddCommand } from "./add.js";
import { integrationConnectCommand } from "./connect.js";
import { integrationListCommand } from "./list.js";
import { integrationRemoveCommand } from "./remove.js";

export const integrationCommands = [
  integrationListCommand,
  integrationConnectCommand,
  integrationAddCommand,
  integrationRemoveCommand,
] as const;
