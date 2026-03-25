import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { cn } from "../../lib/utils";

interface SuggestionPayload {
  actionType?: string;
  args?: Record<string, unknown>;
  confidence?: number;
  rationaleSummary?: string;
  expiresAt?: string;
}

interface InboxSuggestionBodyProps {
  payload: SuggestionPayload;
  sending: boolean;
  onAccept: (edits?: Record<string, unknown>) => void;
  onDismiss: () => void;
}

/** Human-readable labels for action types. */
const ACTION_LABELS: Record<string, string> = {
  "ticket.create": "Create ticket",
  "ticket.update": "Update ticket",
  "ticket.addComment": "Add comment",
  "link.create": "Link entities",
  "session.start": "Start session",
  "message.send": "Send message",
};

/** Fields that are user-editable before accepting. */
const EDITABLE_FIELDS: Record<string, string[]> = {
  "ticket.create": ["title", "description", "priority"],
  "ticket.update": ["title", "description", "status", "priority"],
  "ticket.addComment": ["text"],
  "message.send": ["text"],
  "session.start": ["prompt"],
};

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function timeUntil(dateStr: string): string {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "< 1h left";
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export function InboxSuggestionBody({
  payload,
  sending,
  onAccept,
  onDismiss,
}: InboxSuggestionBodyProps) {
  const [editing, setEditing] = useState(false);
  const [editedArgs, setEditedArgs] = useState<Record<string, string>>({});

  const actionType = payload.actionType ?? "unknown";
  const actionLabel = ACTION_LABELS[actionType] ?? actionType;
  const args = payload.args ?? {};
  const editableFields = EDITABLE_FIELDS[actionType] ?? [];
  const confidence = payload.confidence;
  const expiresAt = payload.expiresAt;

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

  return (
    <div className="px-4 pb-3">
      {/* Action details */}
      <div className="mb-2 rounded-md border border-border bg-surface-deep px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-accent">{actionLabel}</span>
          <div className="flex items-center gap-2">
            {confidence !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
            {expiresAt && (
              <span className="text-[10px] text-muted-foreground">
                {timeUntil(expiresAt)}
              </span>
            )}
          </div>
        </div>

        {/* Rationale */}
        {payload.rationaleSummary && (
          <p className="mb-2 text-xs text-muted-foreground">{payload.rationaleSummary}</p>
        )}

        {/* Proposed fields */}
        <div className="space-y-1">
          {Object.entries(args).map(([key, value]) => {
            const isEditable = editing && editableFields.includes(key);
            const displayValue = editedArgs[key] ?? formatFieldValue(value);

            return (
              <div key={key} className="flex items-start gap-2 text-xs">
                <span className="w-20 shrink-0 pt-0.5 font-medium text-muted-foreground">
                  {key}
                </span>
                {isEditable ? (
                  <input
                    type="text"
                    value={displayValue}
                    onChange={(e) => handleEditField(key, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                ) : (
                  <span className="flex-1 text-foreground">{formatFieldValue(value)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={sending}
          onClick={(e) => {
            e.stopPropagation();
            handleAccept();
          }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-accent hover:bg-accent/10 hover:text-accent",
            sending && "opacity-50",
          )}
        >
          <Check size={12} />
          Accept
        </button>
        {editableFields.length > 0 && (
          <button
            type="button"
            disabled={sending}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(!editing);
            }}
            className={cn(
              "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
              editing
                ? "border-accent/50 bg-accent/10 text-accent"
                : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
              sending && "opacity-50",
            )}
          >
            <Pencil size={12} />
            {editing ? "Editing" : "Edit"}
          </button>
        )}
        <button
          type="button"
          disabled={sending}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-red-400",
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
