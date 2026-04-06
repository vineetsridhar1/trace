import { useEffect } from "react";
import { useEntityStore } from "@/stores/entity";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

/**
 * Registers Cmd+ArrowUp (Mac) / Ctrl+ArrowUp (other) keyboard shortcut
 * to return to the parent branch's fork point. Only fires when no text
 * input/textarea is focused.
 */
export function useReturnToForkShortcut(
  conversationId: string,
  branchId: string | undefined,
): void {
  useEffect(() => {
    if (!branchId) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Only trigger on Cmd+ArrowUp (Mac) or Ctrl+ArrowUp (other)
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key !== "ArrowUp") return;

      // Don't fire when user is typing in an input/textarea
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      const branch = useEntityStore.getState().aiBranches[branchId!];
      if (!branch?.parentBranchId || !branch.forkTurnId) return;

      e.preventDefault();
      useAiConversationUIStore
        .getState()
        .setActiveBranch(conversationId, branch.parentBranchId);
      useAiConversationUIStore
        .getState()
        .setScrollTargetTurnId(branch.forkTurnId);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [conversationId, branchId]);
}
