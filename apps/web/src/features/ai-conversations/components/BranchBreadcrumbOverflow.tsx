import { useCallback } from "react";
import { useEntityField } from "../../../stores/entity";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BranchAncestorInfo } from "../hooks/useBranchAncestors";

interface BranchBreadcrumbOverflowProps {
  /** The collapsed middle ancestors (not root, not the last 2) */
  collapsedAncestors: BranchAncestorInfo[];
  onNavigate: (branchId: string) => void;
}

/**
 * Renders a `...` trigger that expands to show collapsed middle breadcrumb items
 * in a popover dropdown.
 */
export function BranchBreadcrumbOverflow({
  collapsedAncestors,
  onNavigate,
}: BranchBreadcrumbOverflowProps) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "text-sm text-muted-foreground hover:text-foreground",
          "cursor-pointer bg-transparent border-none p-0 transition-colors",
        )}
      >
        &hellip;
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="flex flex-col">
          {collapsedAncestors.map((ancestor) => (
            <OverflowItem
              key={ancestor.id}
              branchId={ancestor.id}
              firstTurnId={ancestor.firstTurnId}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface OverflowItemProps {
  branchId: string;
  firstTurnId: string | undefined;
  onNavigate: (branchId: string) => void;
}

function OverflowItem({ branchId, firstTurnId, onNavigate }: OverflowItemProps) {
  const branchLabel = useEntityField("aiBranches", branchId, "label");
  const firstTurnContent = useEntityField("aiTurns", firstTurnId ?? "", "content");

  const displayLabel = branchLabel ?? (firstTurnContent ? firstTurnContent.slice(0, 40).trim() : "New branch");

  const handleClick = useCallback(() => {
    onNavigate(branchId);
  }, [onNavigate, branchId]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full text-left text-sm px-2 py-1.5 rounded-sm truncate",
        "text-muted-foreground hover:text-foreground hover:bg-accent",
        "cursor-pointer bg-transparent border-none transition-colors",
      )}
      title={displayLabel}
    >
      {displayLabel}
    </button>
  );
}
