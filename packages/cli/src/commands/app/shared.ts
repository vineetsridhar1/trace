import { CliError, ExitCode } from "../../errors.js";
import type { CommandContext } from "../../runtime.js";

export function requireCurrentAppGroup(ctx: CommandContext): string {
  const sessionGroupId = ctx.env.TRACE_SESSION_GROUP_ID;
  if (!sessionGroupId) {
    throw new CliError(
      "This command requires an active Trace app session",
      ExitCode.validation,
      "validation",
    );
  }
  return sessionGroupId;
}
