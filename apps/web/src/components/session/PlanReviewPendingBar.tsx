import { X } from "lucide-react";
import { TraceLoader } from "../ui/trace-loader";

export function PlanReviewPendingBar({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-accent/30 bg-surface px-4 py-3">
      {!error && <TraceLoader size={14} showLabel={false} />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Plan Review</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{error ?? "Loading plan controls…"}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-red-400"
        title="Dismiss"
        aria-label="Dismiss plan review"
      >
        <X size={14} />
      </button>
    </div>
  );
}
