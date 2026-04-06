import { useEffect } from "react";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";
import type { Virtualizer } from "@tanstack/react-virtual";

const HIGHLIGHT_DURATION_MS = 1500;

/**
 * Watches `scrollTargetTurnId` from the UI store. When set, scrolls the
 * virtualizer to the matching turn index, triggers a highlight animation
 * on that turn, and then clears both the scroll target and highlight.
 */
export function useScrollToTurn(
  virtualizer: Virtualizer<HTMLDivElement, Element> | null,
  turnIds: string[],
): void {
  const scrollTargetTurnId = useAiConversationUIStore(
    (s) => s.scrollTargetTurnId,
  );
  const setScrollTargetTurnId = useAiConversationUIStore(
    (s) => s.setScrollTargetTurnId,
  );
  const setHighlightTurnId = useAiConversationUIStore(
    (s) => s.setHighlightTurnId,
  );

  useEffect(() => {
    if (!scrollTargetTurnId || !virtualizer) return;

    const targetIndex = turnIds.indexOf(scrollTargetTurnId);
    if (targetIndex === -1) return;

    // Scroll to the target, aligned to start (top of viewport)
    virtualizer.scrollToIndex(targetIndex, { align: "start" });

    // Set highlight for the fork turn
    setHighlightTurnId(scrollTargetTurnId);

    // Clear the scroll target immediately (scroll already initiated)
    setScrollTargetTurnId(null);

    // Clear highlight after animation completes
    const timer = setTimeout(() => {
      setHighlightTurnId(null);
    }, HIGHLIGHT_DURATION_MS);

    return () => clearTimeout(timer);
  }, [scrollTargetTurnId, virtualizer, turnIds, setScrollTargetTurnId, setHighlightTurnId]);
}
