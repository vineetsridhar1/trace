import { GitBranch } from "lucide-react";
import { cn } from "../../../lib/utils";

interface ForkSeparatorProps {
  parentBranchLabel: string | null;
  className?: string;
}

export function ForkSeparator({ parentBranchLabel, className }: ForkSeparatorProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-2 px-4",
        className,
      )}
    >
      <div className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <GitBranch className="size-3" />
        <span>
          Branch started here
          {parentBranchLabel ? (
            <span className="text-muted-foreground/70">
              {" "}from {parentBranchLabel}
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
