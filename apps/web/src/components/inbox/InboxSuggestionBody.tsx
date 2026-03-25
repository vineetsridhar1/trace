import { useState } from "react";
import {
  Check,
  X,
  Pencil,
  Ticket,
  Link2,
  Play,
  MessageSquare,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useEntityField } from "../../stores/entity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuggestionPayload {
  actionType?: string;
  args?: Record<string, unknown>;
  confidence?: number;
  rationaleSummary?: string;
  expiresAt?: string;
  scopeType?: string;
  scopeId?: string;
}

interface InboxSuggestionBodyProps {
  payload: SuggestionPayload;
  sending: boolean;
  onAccept: (edits?: Record<string, unknown>) => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Action metadata
// ---------------------------------------------------------------------------

const ACTION_META: Record<string, { label: string; icon: typeof Ticket; verb: string }> = {
  "ticket.create": { label: "Create ticket", icon: Ticket, verb: "Create" },
  "ticket.update": { label: "Update ticket", icon: Ticket, verb: "Update" },
  "ticket.addComment": { label: "Add comment", icon: MessageSquare, verb: "Comment" },
  "link.create": { label: "Link entities", icon: Link2, verb: "Link" },
  "session.start": { label: "Start session", icon: Play, verb: "Start" },
  "message.send": { label: "Send message", icon: MessageSquare, verb: "Send" },
};

const EDITABLE_FIELDS: Record<string, string[]> = {
  "ticket.create": ["title", "description", "priority"],
  "ticket.update": ["title", "description", "status", "priority"],
  "ticket.addComment": ["text"],
  "message.send": ["text"],
  "session.start": ["prompt"],
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  backlog: "bg-zinc-500/15 text-zinc-400",
  todo: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-amber-500/15 text-amber-400",
  in_review: "bg-purple-500/15 text-purple-400",
  done: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
};

// ---------------------------------------------------------------------------
// Entity name resolver
// ---------------------------------------------------------------------------

function EntityName({ type, id }: { type: "channels" | "sessions" | "tickets"; id: string }) {
  const name = useEntityField(type, id, "name") as string | undefined;
  const title = useEntityField(type, id, "title") as string | undefined;
  const display = name ?? title;
  if (!display) return <span className="font-mono text-muted-foreground">{id.slice(0, 8)}…</span>;
  return <span className="font-medium text-foreground">{display}</span>;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function timeUntil(dateStr: string): { text: string; urgent: boolean } {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return { text: "expired", urgent: true };
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return { text: "< 1h", urgent: true };
  if (hours < 6) return { text: `${hours}h`, urgent: true };
  if (hours < 24) return { text: `${hours}h`, urgent: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d`, urgent: false };
}

// ---------------------------------------------------------------------------
// Action-specific detail renderers
// ---------------------------------------------------------------------------

function TicketCreateDetails({
  args,
  editing,
  editedArgs,
  onEdit,
}: {
  args: Record<string, unknown>;
  editing: boolean;
  editedArgs: Record<string, string>;
  onEdit: (field: string, value: string) => void;
}) {
  const title = editedArgs.title ?? (args.title as string) ?? "";
  const description = editedArgs.description ?? (args.description as string) ?? "";
  const priority = (args.priority as string) ?? "medium";
  const labels = (args.labels as string[]) ?? [];
  const channelId = args.channelId as string | undefined;

  return (
    <div className="space-y-2">
      {/* Title */}
      {editing ? (
        <input
          type="text"
          value={title}
          onChange={(e) => onEdit("title", e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Ticket title"
        />
      ) : (
        <p className="text-sm font-medium text-foreground">{title}</p>
      )}

      {/* Description */}
      {(description || editing) && (
        editing ? (
          <textarea
            value={description}
            onChange={(e) => onEdit("description", e.target.value)}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Description"
          />
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        )
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Priority badge */}
        <span className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
          PRIORITY_COLORS[priority] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
        )}>
          {priority}
        </span>

        {/* Labels */}
        {labels.map((label) => (
          <span
            key={label}
            className="inline-flex rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {label}
          </span>
        ))}

        {/* Channel */}
        {channelId && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            in <EntityName type="channels" id={channelId} />
          </span>
        )}
      </div>
    </div>
  );
}

function TicketUpdateDetails({ args }: { args: Record<string, unknown> }) {
  const ticketId = args.id as string | undefined;
  const status = args.status as string | undefined;
  const priority = args.priority as string | undefined;
  const title = args.title as string | undefined;

  return (
    <div className="space-y-1.5">
      {ticketId && (
        <p className="text-xs text-muted-foreground">
          Ticket: <EntityName type="tickets" id={ticketId} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {title && <span className="text-xs text-foreground">{title}</span>}
        {status && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
            STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-400",
          )}>
            {status.replace("_", " ")}
          </span>
        )}
        {priority && (
          <span className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
            PRIORITY_COLORS[priority] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
          )}>
            {priority}
          </span>
        )}
      </div>
    </div>
  );
}

function CommentDetails({ args }: { args: Record<string, unknown> }) {
  const ticketId = args.ticketId as string | undefined;
  const text = args.text as string | undefined;

  return (
    <div className="space-y-1.5">
      {ticketId && (
        <p className="text-[11px] text-muted-foreground">
          on <EntityName type="tickets" id={ticketId} />
        </p>
      )}
      {text && (
        <div className="rounded-md border-l-2 border-accent/40 bg-surface-elevated/50 px-3 py-1.5">
          <p className="text-xs leading-relaxed text-foreground">{text}</p>
        </div>
      )}
    </div>
  );
}

function SessionStartDetails({ args }: { args: Record<string, unknown> }) {
  const prompt = args.prompt as string | undefined;
  const channelId = args.channelId as string | undefined;

  return (
    <div className="space-y-1.5">
      {channelId && (
        <p className="text-[11px] text-muted-foreground">
          in <EntityName type="channels" id={channelId} />
        </p>
      )}
      {prompt && (
        <div className="rounded-md border-l-2 border-accent/40 bg-surface-elevated/50 px-3 py-1.5">
          <p className="text-xs leading-relaxed text-foreground">{prompt}</p>
        </div>
      )}
    </div>
  );
}

function MessageDetails({ args }: { args: Record<string, unknown> }) {
  const text = args.text as string | undefined;
  return text ? (
    <div className="rounded-md border-l-2 border-accent/40 bg-surface-elevated/50 px-3 py-1.5">
      <p className="text-xs leading-relaxed text-foreground">{text}</p>
    </div>
  ) : null;
}

function GenericDetails({ args }: { args: Record<string, unknown> }) {
  // Filter out internal IDs, show only human-readable fields
  const HIDDEN_KEYS = new Set(["channelId", "projectId", "chatId", "repoId", "ticketId", "id", "entityId", "entityType", "sessionGroupId", "sourceSessionId"]);

  const entries = Object.entries(args).filter(
    ([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined && value !== null && value !== "",
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</span>
          <span className="text-foreground">
            {typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InboxSuggestionBody({
  payload,
  sending,
  onAccept,
  onDismiss,
}: InboxSuggestionBodyProps) {
  const [editing, setEditing] = useState(false);
  const [editedArgs, setEditedArgs] = useState<Record<string, string>>({});

  const actionType = payload.actionType ?? "unknown";
  const meta = ACTION_META[actionType] ?? { label: actionType, icon: AlertTriangle, verb: "Run" };
  const Icon = meta.icon;
  const args = payload.args ?? {};
  const editableFields = EDITABLE_FIELDS[actionType] ?? [];
  const confidence = payload.confidence;
  const expiresAt = payload.expiresAt;
  const expiry = expiresAt ? timeUntil(expiresAt) : null;

  const handleAccept = () => {
    if (editing && Object.keys(editedArgs).length > 0) {
      onAccept(editedArgs);
    } else {
      onAccept();
    }
  };

  const handleEditField = (field: string, value: string) => {
    setEditedArgs((prev) => ({ ...prev, [field]: value }));
  };

  // Render action-specific details
  const renderDetails = () => {
    switch (actionType) {
      case "ticket.create":
        return <TicketCreateDetails args={args} editing={editing} editedArgs={editedArgs} onEdit={handleEditField} />;
      case "ticket.update":
        return <TicketUpdateDetails args={args} />;
      case "ticket.addComment":
        return <CommentDetails args={args} />;
      case "session.start":
        return <SessionStartDetails args={args} />;
      case "message.send":
        return <MessageDetails args={args} />;
      default:
        return <GenericDetails args={args} />;
    }
  };

  return (
    <div className="px-4 pb-3">
      {/* Card */}
      <div className="accent-dashed-container mb-2.5 px-3.5 py-3">
        {/* Header row: action type + metadata */}
        <div className="mb-2 flex items-center gap-2">
          <Icon size={14} className="shrink-0 text-accent" />
          <span className="text-xs font-semibold text-accent">{meta.label}</span>
          <div className="ml-auto flex items-center gap-2">
            {confidence !== undefined && (
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                confidence >= 0.8
                  ? "bg-emerald-500/15 text-emerald-400"
                  : confidence >= 0.5
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-zinc-500/15 text-zinc-400",
              )}>
                {Math.round(confidence * 100)}%
              </span>
            )}
            {expiry && (
              <span className={cn(
                "flex items-center gap-0.5 text-[10px]",
                expiry.urgent ? "text-amber-400" : "text-muted-foreground",
              )}>
                <Clock size={10} />
                {expiry.text}
              </span>
            )}
          </div>
        </div>

        {/* Rationale */}
        {payload.rationaleSummary && (
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            {payload.rationaleSummary}
          </p>
        )}

        {/* Action-specific details */}
        {renderDetails()}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={sending}
          onClick={(e) => { e.stopPropagation(); handleAccept(); }}
          className={cn(
            "flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90",
            sending && "opacity-50",
          )}
        >
          <Check size={12} />
          {meta.verb}
        </button>
        {editableFields.length > 0 && (
          <button
            type="button"
            disabled={sending}
            onClick={(e) => { e.stopPropagation(); setEditing(!editing); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              editing
                ? "border-accent/50 bg-accent/10 text-accent"
                : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
              sending && "opacity-50",
            )}
          >
            <Pencil size={12} />
            {editing ? "Editing" : "Edit first"}
          </button>
        )}
        <button
          type="button"
          disabled={sending}
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-red-400",
            sending && "opacity-50",
          )}
        >
          <X size={12} />
          Dismiss
        </button>
      </div>
    </div>
  );
}
