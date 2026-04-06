import { GitBranch } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useBranchField } from "../hooks/useAiConversationSelectors";

interface BranchBadgeProps {
  branchId: string;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function BranchBadge({
  branchId,
  isActive = false,
  onClick,
  className,
}: BranchBadgeProps) {
  const label = useBranchField(branchId, "label");
  const depth = useBranchField(branchId, "depth");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors",
        isActive
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent",
        className,
      )}
    >
      <GitBranch className="size-3" />
      <span className="truncate max-w-[120px]">
        {label ?? `Branch ${depth ?? 0}`}
      </span>
    </button>
  );
}
