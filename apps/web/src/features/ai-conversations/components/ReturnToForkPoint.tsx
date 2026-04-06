import { useCallback } from "react";
import { CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";
import { useBranchField } from "../hooks/useAiConversationSelectors";

interface ReturnToForkPointProps {
  conversationId: string;
  branchId: string;
}

/**
 * Button that navigates from the active branch back to its parent branch,
 * scrolling to and highlighting the fork turn. Only visible when the
 * active branch is not the root (i.e. has a parentBranchId).
 */
export function ReturnToForkPoint({
  conversationId,
  branchId,
}: ReturnToForkPointProps) {
  const parentBranchId = useBranchField(branchId, "parentBranchId");
  const forkTurnId = useBranchField(branchId, "forkTurnId");

  const setActiveBranch = useAiConversationUIStore(
    (s) => s.setActiveBranch,
  );
  const setScrollTargetTurnId = useAiConversationUIStore(
    (s) => s.setScrollTargetTurnId,
  );

  const handleReturn = useCallback(() => {
    if (!parentBranchId || !forkTurnId) return;
    setActiveBranch(conversationId, parentBranchId);
    setScrollTargetTurnId(forkTurnId);
  }, [conversationId, parentBranchId, forkTurnId, setActiveBranch, setScrollTargetTurnId]);

  // Only show when the active branch has a parent (not root)
  if (!parentBranchId) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleReturn}
      className="gap-1.5 text-muted-foreground"
    >
      <CornerUpLeft className="size-3.5" />
      <span>Return to fork point</span>
    </Button>
  );
}
