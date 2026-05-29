import { useState } from "react";
import { Play, PlayCircle, X, Send } from "lucide-react";
import { Markdown } from "../ui/Markdown";
import { cn } from "../../lib/utils";
import { PendingRichTextInput } from "../session/PendingRichTextInput";

interface InboxPlanBodyProps {
  planContent: string;
  sending: boolean;
  onApproveNew: () => void;
  onApproveKeep: () => void;
  onRevise: (text: string) => void;
  onDismiss: () => void;
}

export function InboxPlanBody({
  planContent,
  sending,
  onApproveNew,
  onApproveKeep,
  onRevise,
  onDismiss,
}: InboxPlanBodyProps) {
  const [reviseText, setReviseText] = useState("");

  return (
    <div className="px-4 pb-3">
      {/* Full plan content — matches PlanReviewCard styling */}
      {planContent && (
        <div className="accent-dashed-container mb-2 max-h-96 overflow-y-auto px-4 py-3">
          <Markdown>{planContent}</Markdown>
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          disabled={sending}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onApproveNew();
          }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
            sending && "opacity-50",
          )}
        >
          <PlayCircle size={12} />
          New session
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onApproveKeep();
          }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
            sending && "opacity-50",
          )}
        >
          <Play size={12} />
          Keep context
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={(e: React.MouseEvent) => {
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

      {/* Revise input */}
      <div className="flex items-end gap-2">
        <PendingRichTextInput
          value={reviseText}
          onChange={setReviseText}
          onSubmit={(text) => {
            const trimmed = text.trim();
            if (trimmed) {
              onRevise(trimmed);
              setReviseText("");
            }
          }}
          placeholder="Suggest changes to revise the plan..."
          disabled={sending}
          submitLabel="Revise"
          SubmitIcon={Send}
          submitDisabled={!reviseText.trim()}
        />
      </div>
    </div>
  );
}
