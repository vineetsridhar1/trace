import { CliError, ExitCode } from "../../errors.js";
import type { CommandContext } from "../../runtime.js";
import type {
  RepoApplicationDefinition,
  RepoPortDefinition,
  RepoProcessDefinition,
  SessionApplicationLogEntry,
  SessionApplicationProcess,
  SessionEndpoint,
} from "@trace/gql";

export type EndpointView = Pick<
  SessionEndpoint,
  | "id"
  | "url"
  | "label"
  | "targetPort"
  | "status"
  | "accessMode"
  | "source"
  | "appConfigId"
  | "processConfigId"
>;

export type ProcessView = Pick<
  SessionApplicationProcess,
  "id" | "appConfigId" | "processConfigId" | "label" | "status" | "exitCode" | "lastError"
> & { endpoints: EndpointView[] };

export type LogEntryView = Pick<
  SessionApplicationLogEntry,
  "id" | "processId" | "stream" | "data" | "sequence" | "timestamp"
>;

type PortView = Pick<RepoPortDefinition, "id" | "label" | "port" | "defaultForwardingEnabled">;
type RepoProcessView = Pick<RepoProcessDefinition, "id" | "name" | "command" | "required"> & {
  ports: PortView[];
};

export type ApplicationView = Pick<RepoApplicationDefinition, "id" | "name"> & {
  processes: RepoProcessView[];
};

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
