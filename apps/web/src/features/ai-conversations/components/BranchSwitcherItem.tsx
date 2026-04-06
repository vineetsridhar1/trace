import { GitBranch } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { useEntityStore, type AiBranchEntity, type AiTurnEntity } from "@/stores/entity";

interface BranchSwitcherItemProps {
  branchId: string;
  isActive: boolean;
  onSelect: (branchId: string) => void;
}

/**
 * Derives a display label for a branch:
 * branch.label ?? first turn content preview ?? "New branch"
 */
function useBranchDisplayLabel(branchId: string): string {
  return useEntityStore((state) => {
    const branch: AiBranchEntity | undefined = state.aiBranches[branchId];
    if (!branch) return "Unknown branch";
    if (branch.label) return branch.label;

    // Try to get the first turn's content as a preview
    const firstTurnId = branch.turnIds[0];
    if (firstTurnId) {
      const turn: AiTurnEntity | undefined = state.aiTurns[firstTurnId];
      if (turn?.content) {
        const preview = turn.content.slice(0, 60);
        return preview.length < turn.content.length
          ? `${preview}...`
          : preview;
      }
    }

    return "New branch";
  });
}

export function BranchSwitcherItem({
  branchId,
  isActive,
  onSelect,
}: BranchSwitcherItemProps) {
  const label = useBranchDisplayLabel(branchId);
  const depth = useEntityStore(
    (state) => state.aiBranches[branchId]?.depth ?? 0,
  );
  const turnCount = useEntityStore(
    (state) => state.aiBranches[branchId]?.turnCount ?? 0,
  );
  const createdAt = useEntityStore(
    (state) => state.aiBranches[branchId]?.createdAt,
  );

  return (
    <CommandItem
      value={`${branchId}-${label}`}
      onSelect={() => onSelect(branchId)}
      data-checked={isActive ? "true" : undefined}
    >
      <GitBranch className="size-4 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          depth {depth} · {turnCount} {turnCount === 1 ? "turn" : "turns"}
          {createdAt && (
            <>
              {" · "}
              {formatRelativeTime(createdAt)}
            </>
          )}
        </span>
      </div>
      {isActive && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          current
        </span>
      )}
    </CommandItem>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
