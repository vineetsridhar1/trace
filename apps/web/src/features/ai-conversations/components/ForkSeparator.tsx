import { GitBranch } from "lucide-react";

interface ForkSeparatorProps {
  parentBranchLabel: string | null;
}

export function ForkSeparator({ parentBranchLabel }: ForkSeparatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1">
      <div className="flex-1 border-t border-border" />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <GitBranch size={12} />
        <span>Branched{parentBranchLabel ? ` from ${parentBranchLabel}` : ""}</span>
      </div>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}
