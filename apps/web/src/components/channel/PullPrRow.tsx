import type { PullRequest } from "@trace/gql";
import { cn } from "../../lib/utils";

export function PullPrRow({
  pullRequest,
  disabled,
  onPull,
}: {
  pullRequest: PullRequest;
  disabled: boolean;
  onPull: (pullRequest: PullRequest) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPull(pullRequest)}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-elevated",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          #{pullRequest.number}
        </span>
        <span className="truncate text-sm font-medium text-foreground">{pullRequest.title}</span>
        {pullRequest.isDraft && (
          <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Draft
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{pullRequest.author}</span>
        <span>·</span>
        <span className="truncate">{pullRequest.branch}</span>
      </div>
    </button>
  );
}
