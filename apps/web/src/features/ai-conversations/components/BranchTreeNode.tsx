import { useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBranchField,
  useTurnField,
  useActiveBranchId,
  useTreeNodeCollapsed,
} from "../hooks/useAiConversationSelectors";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

interface BranchTreeNodeProps {
  branchId: string;
  conversationId: string;
  childBranchIds: string[];
  depth: number;
}

/** Truncate text to ~30 chars at a word boundary */
function truncateAtWord(text: string, max = 30): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 10 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

/** Display label for a branch node using first turn content as fallback */
function BranchLabel({ branchId }: { branchId: string }) {
  const label = useBranchField(branchId, "label");
  const turnIds = useBranchField(branchId, "turnIds");
  const firstTurnId = turnIds?.[0];

  // Always call the hook, pass empty string when no turn exists
  const firstTurnContent = useTurnField(firstTurnId ?? "", "content");

  if (label) return <span>{truncateAtWord(label)}</span>;

  if (firstTurnId && firstTurnContent) {
    return <span>{truncateAtWord(firstTurnContent)}</span>;
  }

  return <span className="text-muted-foreground italic">New branch</span>;
}

export function BranchTreeNode({
  branchId,
  conversationId,
  childBranchIds,
  depth,
}: BranchTreeNodeProps) {
  const activeBranchId = useActiveBranchId(conversationId);
  const isActive = activeBranchId === branchId;
  const turnCount = useBranchField(branchId, "turnCount") ?? 0;
  const isCollapsed = useTreeNodeCollapsed(branchId);
  const hasChildren = childBranchIds.length > 0;

  const setActiveBranch = useAiConversationUIStore((s) => s.setActiveBranch);
  const toggleCollapsed = useAiConversationUIStore((s) => s.toggleTreeNodeCollapsed);

  const handleClick = useCallback(() => {
    setActiveBranch(conversationId, branchId);
  }, [setActiveBranch, conversationId, branchId]);

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleCollapsed(branchId);
    },
    [toggleCollapsed, branchId],
  );

  return (
    <div className="select-none">
      <button
        onClick={handleClick}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-accent/50",
          isActive && "bg-accent text-accent-foreground font-medium",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <span
            role="button"
            onClick={handleToggleExpand}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-accent"
          >
            <motion.span
              animate={{ rotate: isCollapsed ? 0 : 90 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center"
            >
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </motion.span>
          </span>
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <GitBranch className="h-3 w-3 text-muted-foreground/50" />
          </span>
        )}

        {/* Branch label */}
        <span className="min-w-0 flex-1 truncate text-left">
          <BranchLabel branchId={branchId} />
        </span>

        {/* Turn count badge */}
        {turnCount > 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none",
              "bg-muted text-muted-foreground",
              isActive && "bg-accent-foreground/10",
            )}
          >
            {turnCount}
          </span>
        )}
      </button>

      {/* Child branches */}
      <AnimatePresence initial={false}>
        {hasChildren && !isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {childBranchIds.map((childId) => (
              <BranchTreeNodeContainer
                key={childId}
                branchId={childId}
                conversationId={conversationId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Container that reads branch data from the store and passes it
 * to BranchTreeNode. Separates data fetching from rendering.
 */
function BranchTreeNodeContainer({
  branchId,
  conversationId,
}: {
  branchId: string;
  conversationId: string;
}) {
  const childBranchIds = useBranchField(branchId, "childBranchIds") ?? [];
  const depth = useBranchField(branchId, "depth") ?? 0;

  return (
    <BranchTreeNode
      branchId={branchId}
      conversationId={conversationId}
      childBranchIds={childBranchIds}
      depth={depth}
    />
  );
}

export { BranchTreeNodeContainer };
