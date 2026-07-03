import type { Command } from "commander";
import type { AgentStatus, CodingTool, SessionStatus } from "@trace/gql";
import { attachToSession } from "../attach/attach.js";
import { resolveServerUrl } from "../config.js";
import { graphqlRequest } from "../http.js";
import { promptSession, startNewSession, stopSession, withGqlClient } from "../mutations.js";
import { formatTable } from "../output.js";
import { requireActiveOrg, resolveRepoByName, resolveSessionByIdPrefix } from "../resolve.js";
import {
  AGENT_STATUSES,
  CODING_TOOLS,
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

  sessions
    .command("new")
    .description("Create a session (fire-and-forget; the service picks the runtime)")
    .option("--repo <name>", "repo name")
    .option("--branch <branch>", "base branch")
    .option("--tool <tool>", `coding tool (${CODING_TOOLS.join(", ")}); defaults to your profile`)
    .option("-m, --message <prompt>", "initial prompt")
    .action(
      async (
        opts: { repo?: string; branch?: string; tool?: string; message?: string },
        cmd: Command,
      ) => {
        const globals = cmd.optsWithGlobals();
        const serverUrl = resolveServerUrl(globals.server as string | undefined);
        const orgId = requireActiveOrg();
        if (opts.tool && !(CODING_TOOLS as readonly string[]).includes(opts.tool)) {
          throw new Error(`Unknown tool "${opts.tool}". Valid: ${CODING_TOOLS.join(", ")}.`);
        }
        const repoId = opts.repo
          ? (await resolveRepoByName(serverUrl, orgId, opts.repo)).id
          : undefined;

        const session = await withGqlClient(serverUrl, (client, runtime) => {
          const user = runtime.stores.auth.getState().user;
          const tool =
            (opts.tool as CodingTool | undefined) ?? user?.defaultSessionTool ?? undefined;
          const model =
            !opts.tool || opts.tool === user?.defaultSessionTool
              ? (user?.defaultSessionModel ?? undefined)
              : undefined;
          return startNewSession(client, {
            repoId,
            branch: opts.branch,
            tool,
            model,
            prompt: opts.message,
          });
        });

        if (globals.json) {
          console.log(
            JSON.stringify({ id: session.id, sessionGroupId: session.sessionGroupId ?? null }),
          );
          return;
        }
        console.log(`Created session ${session.id}`);
      },
    );

  sessions
    .command("prompt")
    .description("Send a prompt to a session (fire-and-forget)")
    .argument("<id>", "session ID or unique prefix")
    .requiredOption("-m, --message <text>", "prompt text")
    .action(async (idPrefix: string, opts: { message: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      const session = await resolveSessionByIdPrefix(serverUrl, orgId, idPrefix);
      const result = await withGqlClient(serverUrl, (client) =>
        promptSession(client, session, opts.message),
      );
      if (globals.json) {
        console.log(
          JSON.stringify({ id: result.id, sessionId: session.id, queued: result.queued }),
        );
        return;
      }
      console.log(
        result.queued
          ? `Queued prompt for busy session ${session.id} (${result.id})`
          : `Prompted session ${session.id} (event ${result.id})`,
      );
    });

  sessions
    .command("attach")
    .description("Stream a session transcript; stdin lines send prompts; Ctrl-C detaches")
    .argument("<id>", "session ID or unique prefix")
    .action(async (idPrefix: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      await attachToSession({ serverUrl, idPrefix, json: Boolean(globals.json) });
    });

  sessions
    .command("stop")
    .description("Terminate a session")
    .argument("<id>", "session ID or unique prefix")
    .action(async (idPrefix: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      const session = await resolveSessionByIdPrefix(serverUrl, orgId, idPrefix);
      const stopped = await withGqlClient(serverUrl, (client) => stopSession(client, session.id));
      if (globals.json) {
        console.log(JSON.stringify({ id: stopped.id }));
        return;
      }
      console.log(`Stopped session ${stopped.id}`);
    });
}
