import type { Command } from "commander";
import type { AgentStatus, SessionStatus } from "@trace/gql";
import { resolveServerUrl } from "../config.js";
import { graphqlRequest } from "../http.js";
import { formatTable } from "../output.js";
import { requireActiveOrg, resolveRepoByName } from "../resolve.js";
import {
  AGENT_STATUSES,
  SESSION_HEADER,
  SESSION_STATUSES,
  sessionToJson,
  sessionToRow,
  type SessionListItem,
} from "../views.js";

const SESSIONS_QUERY = `query($orgId: ID!, $filters: SessionFilters) {
  sessions(organizationId: $orgId, filters: $filters) {
    id name agentStatus sessionStatus tool branch updatedAt repo { name }
  }
}`;

function isAgentStatus(value: string): value is AgentStatus {
  return (AGENT_STATUSES as readonly string[]).includes(value);
}

function isSessionStatus(value: string): value is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value);
}

export function registerSessionCommands(program: Command): void {
  const sessions = program.command("sessions").description("Work with sessions");

  sessions
    .command("list")
    .description("List sessions in the active organization")
    .option("--status <status>", "filter by session status or agent status")
    .option("--repo <name>", "filter by repo name")
    .action(async (opts: { status?: string; repo?: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();

      const filters: Record<string, unknown> = {};
      let clientStatus: SessionStatus | null = null;
      if (opts.status) {
        if (isAgentStatus(opts.status)) {
          // The schema's SessionFilters supports agentStatus server-side.
          filters.agentStatus = opts.status;
        } else if (isSessionStatus(opts.status)) {
          // No sessionStatus filter exists in SessionFilters — filter client-side.
          clientStatus = opts.status;
        } else {
          throw new Error(
            `Unknown status "${opts.status}". Session statuses: ${SESSION_STATUSES.join(", ")}. ` +
              `Agent statuses: ${AGENT_STATUSES.join(", ")}.`,
          );
        }
      }
      if (opts.repo) {
        filters.repoId = (await resolveRepoByName(serverUrl, orgId, opts.repo)).id;
      }

      const data = await graphqlRequest<{ sessions: SessionListItem[] }>(
        serverUrl,
        SESSIONS_QUERY,
        { orgId, filters: Object.keys(filters).length > 0 ? filters : undefined },
      );
      let items = data.sessions;
      if (clientStatus) {
        items = items.filter((session) => session.sessionStatus === clientStatus);
      }

      if (globals.json) {
        console.log(JSON.stringify(items.map(sessionToJson)));
        return;
      }
      if (items.length === 0) {
        console.error("No sessions found.");
        return;
      }
      console.log(formatTable([SESSION_HEADER, ...items.map((session) => sessionToRow(session))]));
    });
}
