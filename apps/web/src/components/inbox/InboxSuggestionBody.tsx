import { useState } from "react";
import { Check, X, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { ScopeRef } from "./ScopeRef";
import { SuggestionExpandedDetails } from "./SuggestionExpandedDetails";
import { ACTION_META, FALLBACK_META, PRIORITY_STYLES, timeUntil } from "./suggestion-meta";

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
  const priority = typeof args.priority === "string" ? args.priority : null;

  const actionTitle = meta.titleFn(args);

  const handleAccept = () => {
    if (expanded && Object.keys(editedArgs).length > 0) {
      onAccept(editedArgs);
    } else {
      onAccept();
    }
  };

  const handleEditField = (field: string, value: string) => {
    setEditedArgs((prev: Record<string, string>) => ({ ...prev, [field]: value }));
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
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                confidence >= 0.8
                  ? "bg-emerald-500/10 text-emerald-400"
                  : confidence >= 0.5
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-zinc-500/10 text-zinc-400",
              )}
            >
              {Math.round(confidence * 100)}% confident
            </span>
          )}
          {expiry && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[10px]",
                expiry.urgent ? "text-amber-400" : "text-muted-foreground/60",
              )}
            >
              <Clock size={10} />
              {expiry.text}
            </span>
          )}
          {actionType === "ticket.create" && priority && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                PRIORITY_STYLES[priority] ?? "bg-zinc-500/10 text-zinc-400",
              )}
            >
              {priority}
            </span>
          )}
        </div>

        {/* ── Expanded details ── */}
        {expanded && meta.editableFields.length > 0 && (
          <div className="mt-2.5 pl-8">
            <SuggestionExpandedDetails
              args={args}
              meta={meta}
              editedArgs={editedArgs}
              onEdit={handleEditField}
            />
          </div>
        )}

        {/* ── Row 4: Actions ── */}
        <div className="mt-3 flex items-center gap-1.5 pl-8">
          <button
            type="button"
            disabled={sending}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleAccept();
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90",
              sending && "opacity-50",
            )}
          >
            <Check size={12} />
            {meta.verb}
          </button>

          {meta.editableFields.length > 0 && (
            <button
              type="button"
              disabled={sending}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
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

          <button
            type="button"
            disabled={sending}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDismiss();
            }}
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
