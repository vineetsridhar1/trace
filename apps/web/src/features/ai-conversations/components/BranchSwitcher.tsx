import { useCallback } from "react";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";
import {
  useAiConversationField,
  useActiveBranchId,
} from "../hooks/useAiConversationSelectors";
import { BranchBadge } from "./BranchBadge";

interface BranchSwitcherProps {
  conversationId: string;
}

export function BranchSwitcher({ conversationId }: BranchSwitcherProps) {
  const branchIds = useAiConversationField(conversationId, "branchIds");
  const activeBranchId = useActiveBranchId(conversationId);

  const handleSwitch = useCallback(
    (branchId: string) => {
      useAiConversationUIStore.getState().setActiveBranch(conversationId, branchId);
    },
    [conversationId],
  );

  if (!branchIds || branchIds.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 overflow-x-auto border-b border-border">
      {branchIds.map((branchId) => (
        <BranchBadge
          key={branchId}
          branchId={branchId}
          isActive={branchId === activeBranchId}
          onClick={() => handleSwitch(branchId)}
        />
      ))}
    </div>
  );
}
