import { Ticket, Link2, Play, MessageSquare } from "lucide-react";

export interface ActionMeta {
  verb: string;
  icon: typeof Ticket;
  titleFn: (args: Record<string, unknown>) => string;
  editableFields: string[];
  fieldLabels: Record<string, string>;
}

export const ACTION_META: Record<string, ActionMeta> = {
  "ticket.create": {
    verb: "Create",
    icon: Ticket,
    titleFn: (args) => `Create ticket: ${(args.title as string) || "Untitled"}`,
    editableFields: ["title", "description", "priority"],
    fieldLabels: { title: "Title", description: "Description", priority: "Priority" },
  },
  "ticket.update": {
    verb: "Update",
    icon: Ticket,
    titleFn: (args) => `Update ticket${args.title ? `: ${args.title}` : ""}`,
    editableFields: ["title", "description", "status", "priority"],
    fieldLabels: {
      title: "Title",
      description: "Description",
      status: "Status",
      priority: "Priority",
    },
  },
  "ticket.addComment": {
    verb: "Comment",
    icon: MessageSquare,
    titleFn: () => "Add comment to ticket",
    editableFields: ["text"],
    fieldLabels: { text: "Comment" },
  },
  "link.create": {
    verb: "Link",
    icon: Link2,
    titleFn: () => "Link related entities",
    editableFields: [],
    fieldLabels: {},
  },
  "session.start": {
    verb: "Start session",
    icon: Play,
    titleFn: (args) => {
      const prompt = args.prompt as string | undefined;
      return prompt
        ? `Start session: ${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}`
        : "Start coding session";
    },
    editableFields: ["prompt"],
    fieldLabels: { prompt: "Task" },
  },
  "message.send": {
    verb: "Send",
    icon: MessageSquare,
    titleFn: () => "Send message",
    editableFields: ["text"],
    fieldLabels: { text: "Message" },
  },
};

export const FALLBACK_META: ActionMeta = {
  verb: "Accept",
  icon: Ticket,
  titleFn: (args) => `Agent suggestion${args.title ? `: ${args.title}` : ""}`,
  editableFields: [],
  fieldLabels: {},
};

export const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400",
  high: "bg-orange-500/15 text-orange-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-emerald-500/15 text-emerald-400",
};

export function timeUntil(dateStr: string): { text: string; urgent: boolean } {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return { text: "expired", urgent: true };
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return { text: "< 1h", urgent: true };
  if (hours < 6) return { text: `${hours}h`, urgent: true };
  if (hours < 24) return { text: `${hours}h`, urgent: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d`, urgent: false };
}
