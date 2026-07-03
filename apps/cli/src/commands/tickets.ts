import type { Command } from "commander";
import type { TicketStatus } from "@trace/gql";
import { resolveServerUrl } from "../config.js";
import { graphqlRequest } from "../http.js";
import { formatTable } from "../output.js";
import { requireActiveOrg } from "../resolve.js";
import {
  TICKET_HEADER,
  TICKET_STATUSES,
  ticketToJson,
  ticketToRow,
  type TicketListItem,
} from "../views.js";

const TICKETS_QUERY = `query($orgId: ID!, $filters: TicketFilters) {
  tickets(organizationId: $orgId, filters: $filters) {
    id title status priority updatedAt
  }
}`;

function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export function registerTicketCommands(program: Command): void {
  const tickets = program.command("tickets").description("Work with tickets");

  tickets
    .command("list")
    .description("List tickets in the active organization")
    .option("--status <status>", "filter by ticket status (server-side)")
    .action(async (opts: { status?: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      if (opts.status && !isTicketStatus(opts.status)) {
        throw new Error(
          `Unknown ticket status "${opts.status}". Valid: ${TICKET_STATUSES.join(", ")}.`,
        );
      }
      const data = await graphqlRequest<{ tickets: TicketListItem[] }>(serverUrl, TICKETS_QUERY, {
        orgId,
        filters: opts.status ? { status: opts.status } : undefined,
      });
      if (globals.json) {
        console.log(JSON.stringify(data.tickets.map(ticketToJson)));
        return;
      }
      if (data.tickets.length === 0) {
        console.error("No tickets found.");
        return;
      }
      console.log(
        formatTable([TICKET_HEADER, ...data.tickets.map((ticket) => ticketToRow(ticket))]),
      );
    });
}
