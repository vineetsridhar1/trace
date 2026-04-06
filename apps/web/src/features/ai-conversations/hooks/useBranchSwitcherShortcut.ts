import { useEffect } from "react";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

/**
 * Registers the Cmd+B / Ctrl+B keyboard shortcut to toggle the branch switcher.
 * Only active when a conversation ID is provided (i.e., when a conversation is open).
 */
export function useBranchSwitcherShortcut(conversationId: string | null) {
  const setBranchSwitcherOpen = useAiConversationUIStore(
    (s) => s.setBranchSwitcherOpen,
  );
  const branchSwitcherOpen = useAiConversationUIStore(
    (s) => s.branchSwitcherOpen,
  );

  useEffect(() => {
    if (!conversationId) return;

    function handleKeyDown(e: KeyboardEvent) {
      const isModifier = e.metaKey || e.ctrlKey;
      if (isModifier && e.key === "b") {
        e.preventDefault();
        setBranchSwitcherOpen(!branchSwitcherOpen);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [conversationId, branchSwitcherOpen, setBranchSwitcherOpen]);
}
