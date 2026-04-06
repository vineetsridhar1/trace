import { useCallback } from "react";
import { useEntityField } from "../../../stores/entity";
import { cn } from "@/lib/utils";

interface BranchBreadcrumbItemProps {
  branchId: string;
  /** Label override for the root branch (conversation title) */
  rootLabel: string | undefined;
  isRoot: boolean;
  isCurrent: boolean;
  firstTurnId: string | undefined;
  onClick: (branchId: string) => void;
}

/**
 * A single breadcrumb crumb for a branch.
 * Resolves display label from branch.label, first turn content preview, or fallback.
 */
export function BranchBreadcrumbItem({
  branchId,
  rootLabel,
  isRoot,
  isCurrent,
  firstTurnId,
  onClick,
}: BranchBreadcrumbItemProps) {
  const branchLabel = useEntityField("aiBranches", branchId, "label");
  const firstTurnContent = useEntityField(
    "aiTurns",
    firstTurnId ?? "",
    "content",
  );

  const displayLabel = resolveLabel({
    isRoot,
    rootLabel,
    branchLabel: branchLabel ?? null,
    firstTurnContent: firstTurnContent ?? null,
  });

  const handleClick = useCallback(() => {
    if (!isCurrent) {
      onClick(branchId);
    }
  }, [isCurrent, onClick, branchId]);

  if (isCurrent) {
    return (
      <span
        className={cn(
          "truncate max-w-[160px] font-semibold text-foreground text-sm",
        )}
        title={displayLabel}
      >
        {displayLabel}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "truncate max-w-[160px] text-sm text-muted-foreground",
        "hover:text-foreground hover:underline transition-colors",
        "cursor-pointer bg-transparent border-none p-0",
      )}
      title={displayLabel}
    >
      {displayLabel}
    </button>
  );
}

function resolveLabel({
  isRoot,
  rootLabel,
  branchLabel,
  firstTurnContent,
}: {
  isRoot: boolean;
  rootLabel: string | undefined;
  branchLabel: string | null;
  firstTurnContent: string | null;
}): string {
  if (isRoot) {
    return rootLabel ?? "Root";
  }

  if (branchLabel) {
    return branchLabel;
  }

  if (firstTurnContent) {
    // Truncate to a short preview
    const preview = firstTurnContent.slice(0, 40).trim();
    return preview.length < firstTurnContent.length ? `${preview}...` : preview;
  }

  return "New branch";
}
