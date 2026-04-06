import { useCallback, Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntityField } from "../../../stores/entity";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";
import { useBranchAncestors } from "../hooks/useBranchAncestors";
import { BranchBreadcrumbItem } from "./BranchBreadcrumbItem";
import { BranchBreadcrumbOverflow } from "./BranchBreadcrumbOverflow";

/** Maximum ancestors to display before collapsing middle items */
const MAX_VISIBLE_CRUMBS = 4;

interface BranchBreadcrumbProps {
  conversationId: string;
  activeBranchId: string;
}

/**
 * Horizontal breadcrumb trail showing the current branch's ancestry.
 * Hidden when on root branch with no other branches (single-branch conversation).
 */
export function BranchBreadcrumb({
  conversationId,
  activeBranchId,
}: BranchBreadcrumbProps) {
  const ancestors = useBranchAncestors(activeBranchId);
  const conversationTitle = useEntityField("aiConversations", conversationId, "title");
  const branchIds = useEntityField("aiConversations", conversationId, "branchIds");

  const setActiveBranch = useAiConversationUIStore((s) => s.setActiveBranch);

  const handleNavigate = useCallback(
    (branchId: string) => {
      setActiveBranch(conversationId, branchId);
    },
    [conversationId, setActiveBranch],
  );

  // Hide when on root branch with no other branches
  const hasBranches = (branchIds?.length ?? 0) > 1;
  if (ancestors.length <= 1 && !hasBranches) {
    return null;
  }

  // Determine which crumbs are visible vs collapsed
  const needsCollapse = ancestors.length > MAX_VISIBLE_CRUMBS;
  const rootAncestor = ancestors[0];
  const collapsedAncestors = needsCollapse
    ? ancestors.slice(1, ancestors.length - 2)
    : [];
  const visibleTail = needsCollapse ? ancestors.slice(ancestors.length - 2) : ancestors.slice(1);

  return (
    <nav
      aria-label="Branch breadcrumb"
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5",
        "text-sm text-muted-foreground",
        "border-b border-border/50",
        "min-h-[32px] overflow-x-auto",
      )}
    >
      {/* Root crumb is always visible */}
      {rootAncestor && (
        <BranchBreadcrumbItem
          branchId={rootAncestor.id}
          rootLabel={conversationTitle ?? undefined}
          isRoot
          isCurrent={ancestors.length === 1}
          firstTurnId={rootAncestor.firstTurnId}
          onClick={handleNavigate}
        />
      )}

      {/* Separator after root if there are more items */}
      {ancestors.length > 1 && <Separator />}

      {/* Collapsed middle items */}
      {needsCollapse && (
        <>
          <BranchBreadcrumbOverflow
            collapsedAncestors={collapsedAncestors}
            onNavigate={handleNavigate}
          />
          <Separator />
        </>
      )}

      {/* Visible tail items */}
      {visibleTail.map((ancestor, index) => (
        <Fragment key={ancestor.id}>
          {index > 0 && <Separator />}
          <BranchBreadcrumbItem
            branchId={ancestor.id}
            rootLabel={undefined}
            isRoot={false}
            isCurrent={ancestor.id === activeBranchId}
            firstTurnId={ancestor.firstTurnId}
            onClick={handleNavigate}
          />
        </Fragment>
      ))}
    </nav>
  );
}

function Separator() {
  return (
    <ChevronRight
      className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60"
      aria-hidden
    />
  );
}
