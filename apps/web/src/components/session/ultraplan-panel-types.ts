export interface UltraplanTicketSummary {
  id: string;
  status?: string | null;
  position?: number | null;
  ticket?: {
    id: string;
    title?: string | null;
    status?: string | null;
    dependencies?: Array<{
      dependsOnTicket?: {
        id: string;
        title?: string | null;
      } | null;
    }> | null;
  } | null;
}

export interface UltraplanTicketExecutionSummary {
  id: string;
  ticketId?: string | null;
  status?: string | null;
  integrationStatus?: string | null;
  branch?: string | null;
  workerSessionId?: string | null;
}

export interface UltraplanControllerRunSummary {
  id: string;
  status?: string | null;
  summaryTitle?: string | null;
  summary?: string | null;
  sessionId?: string | null;
  createdAt?: string | null;
}

export interface UltraplanSummary {
  id: string;
  status: string;
  planSummary?: string | null;
  lastControllerSummary?: string | null;
  integrationBranch?: string | null;
  activeInboxItemId?: string | null;
  tickets?: UltraplanTicketSummary[] | null;
  ticketExecutions?: UltraplanTicketExecutionSummary[] | null;
  controllerRuns?: UltraplanControllerRunSummary[] | null;
}

export function formatUltraplanStatus(status: string | null | undefined): string {
  return status ? status.replace(/_/g, " ") : "unknown";
}
