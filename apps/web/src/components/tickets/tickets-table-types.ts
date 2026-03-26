import type { Ticket } from "@trace/gql";

export type TicketRow = Ticket & {
  id: string;
};

export const TICKET_FILTER_STORAGE_KEY = "trace:tickets-filter";

export const ticketStatusOrder: Record<string, number> = {
  in_progress: 0,
  in_review: 1,
  todo: 2,
  backlog: 3,
  done: 4,
  cancelled: 5,
};

export const ticketStatusLabel: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  cancelled: "Cancelled",
};

export const ticketStatusColor: Record<string, string> = {
  backlog: "text-muted-foreground",
  todo: "text-foreground",
  in_progress: "text-blue-400",
  in_review: "text-purple-400",
  done: "text-green-400",
  cancelled: "text-muted-foreground",
};

export const ticketPriorityLabel: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ticketPriorityColor: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};
