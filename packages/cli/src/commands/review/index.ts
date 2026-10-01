import type { CommandDefinition } from "../../runtime.js";
import { reviewOpenCommand } from "./open.js";

export const reviewCommands: readonly CommandDefinition[] = [reviewOpenCommand];
