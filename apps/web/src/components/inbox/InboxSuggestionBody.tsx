import { useState } from "react";
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Ticket,
  Link2,
  Play,
  MessageSquare,
  Hash,
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

interface ActionMeta {
  verb: string;
  icon: typeof Ticket;
  titleFn: (args: Record<string, unknown>) => string;
  editableFields: string[];
  fieldLabels: Record<string, string>;
}

const ACTION_META: Record<string, ActionMeta> = {
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
    fieldLabels: { title: "Title", description: "Description", status: "Status", priority: "Priority" },
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
      return prompt ? `Start session: ${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}` : "Start coding session";
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

const FALLBACK_META: ActionMeta = {
  verb: "Accept",
  icon: Ticket,
  titleFn: (args) => `Agent suggestion${args.title ? `: ${args.title}` : ""}`,
  editableFields: [],
  fieldLabels: {},
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400",
  high: "bg-orange-500/15 text-orange-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-emerald-500/15 text-emerald-400",
};

// ---------------------------------------------------------------------------
// Scope reference
// ---------------------------------------------------------------------------

function ScopeRef({ scopeType, scopeId }: { scopeType: string; scopeId: string }) {
  const entityType = scopeType === "channel" ? "channels" as const
    : scopeType === "chat" ? "chats" as const
    : scopeType === "ticket" ? "tickets" as const
    : scopeType === "session" ? "sessions" as const
    : null;

  const name = useEntityField(entityType ?? "channels", entityType ? scopeId : "", "name") as string | undefined;
  const title = useEntityField(entityType ?? "tickets", entityType ? scopeId : "", "title") as string | undefined;

  const display = name ?? title ?? scopeId.slice(0, 8);
  const icon = scopeType === "channel" ? <Hash size={11} className="text-muted-foreground" /> : null;

  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      {icon}
      <span>{display}</span>
    </span>
  );
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
// Expanded details for editing
// ---------------------------------------------------------------------------

function ExpandedDetails({
  args,
  meta,
  editedArgs,
  onEdit,
}: {
  args: Record<string, unknown>;
  meta: ActionMeta;
  editedArgs: Record<string, string>;
  onEdit: (field: string, value: string) => void;
}) {
  return (
    <div className="space-y-2.5 border-t border-border/50 pt-2.5">
      {meta.editableFields.map((field) => {
        const value = editedArgs[field] ?? ((args[field] as string) ?? "");
        const label = meta.fieldLabels[field] ?? field;
        const isLong = field === "description" || field === "prompt" || field === "text";

        if (field === "priority") {
          return (
            <div key={field}>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
              <div className="flex gap-1">
                {["low", "medium", "high", "urgent"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit("priority", p); }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors",
                      (editedArgs.priority ?? args.priority) === p
                        ? PRIORITY_STYLES[p]
                        : "bg-surface-elevated text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (field === "status") {
          return (
            <div key={field}>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
              <div className="flex flex-wrap gap-1">
                {["backlog", "todo", "in_progress", "in_review", "done"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit("status", s); }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors",
                      (editedArgs.status ?? args.status) === s
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-elevated text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={field}>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
            {isLong ? (
              <textarea
                value={value}
                onChange={(e) => onEdit(field, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                rows={2}
                className="w-full rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => onEdit(field, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>
        );
      })}
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
  const [expanded, setExpanded] = useState(false);
  const [editedArgs, setEditedArgs] = useState<Record<string, string>>({});

  const actionType = payload.actionType ?? "unknown";
  const meta = ACTION_META[actionType] ?? FALLBACK_META;
  const Icon = meta.icon;
  const args = payload.args ?? {};
  const confidence = payload.confidence;
  const expiresAt = payload.expiresAt;
  const expiry = expiresAt ? timeUntil(expiresAt) : null;

  const actionTitle = meta.titleFn(args);

  const handleAccept = () => {
    if (expanded && Object.keys(editedArgs).length > 0) {
      onAccept(editedArgs);
    } else {
      onAccept();
    }
  };

  const handleEditField = (field: string, value: string) => {
    setEditedArgs((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="px-4 pb-3">
      <div className="rounded-lg border border-border bg-surface-deep px-3.5 py-3">
        {/* ── Row 1: Title ── */}
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 rounded-md bg-accent/10 p-1">
            <Icon size={14} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{actionTitle}</p>
          </div>
        </div>

        {/* ── Row 2: Justification ── */}
        {payload.rationaleSummary && (
          <p className="mt-1.5 pl-8 text-xs leading-relaxed text-muted-foreground">
            {payload.rationaleSummary}
          </p>
        )}

        {/* ── Row 3: Metadata (scope, confidence, expiry) ── */}
        <div className="mt-2 flex items-center gap-2.5 pl-8">
          {payload.scopeType && payload.scopeId && (
            <ScopeRef scopeType={payload.scopeType} scopeId={payload.scopeId} />
          )}
          {confidence !== undefined && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              confidence >= 0.8
                ? "bg-emerald-500/10 text-emerald-400"
                : confidence >= 0.5
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-zinc-500/10 text-zinc-400",
            )}>
              {Math.round(confidence * 100)}% confident
            </span>
          )}
          {expiry && (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px]",
              expiry.urgent ? "text-amber-400" : "text-muted-foreground/60",
            )}>
              <Clock size={10} />
              {expiry.text}
            </span>
          )}
          {/* Inline preview of key fields */}
          {actionType === "ticket.create" && args.priority && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
              PRIORITY_STYLES[args.priority as string] ?? "bg-zinc-500/10 text-zinc-400",
            )}>
              {args.priority as string}
            </span>
          )}
        </div>

        {/* ── Expanded details ── */}
        {expanded && meta.editableFields.length > 0 && (
          <div className="mt-2.5 pl-8">
            <ExpandedDetails
              args={args}
              meta={meta}
              editedArgs={editedArgs}
              onEdit={handleEditField}
            />
          </div>
        )}

        {/* ── Row 4: Actions ── */}
        <div className="mt-3 flex items-center gap-1.5 pl-8">
          {/* Primary: quick action */}
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

          {/* Secondary: expand/collapse for editing */}
          {meta.editableFields.length > 0 && (
            <button
              type="button"
              disabled={sending}
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className={cn(
                "flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
                expanded
                  ? "border-accent/40 text-accent"
                  : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                sending && "opacity-50",
              )}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? "Less" : "Edit"}
            </button>
          )}

          {/* Dismiss */}
          <button
            type="button"
            disabled={sending}
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className={cn(
              "ml-auto flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-red-400",
              sending && "opacity-50",
            )}
          >
            <X size={12} />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
