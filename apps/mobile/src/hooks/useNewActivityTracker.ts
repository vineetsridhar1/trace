import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { SessionNode } from "@trace/client-core";

function nodeKey(node: SessionNode): string {
  if (node.kind === "readglob-group") return `rg:${node.items[0]?.id ?? "empty"}`;
  return node.id;
}

export { nodeKey };

interface UseNewActivityTrackerResult {
  newActivityCount: number;
  clearNewActivity: () => void;
}

interface ScrollToEndRef {
  scrollToEnd: (params?: { animated?: boolean | undefined }) => void;
}

/**
 * Watches the tail of the node list and either auto-scrolls (when the user
 * is near the bottom) or increments a counter surfaced by the "new activity"
 * pill. Pagination prepends older events and must not register as activity,
 * so we track the tail key rather than the list length.
 */
export function useNewActivityTracker(
  nodes: SessionNode[],
  listRef: MutableRefObject<ScrollToEndRef | null>,
  isNearBottomRef: MutableRefObject<boolean>,
): UseNewActivityTrackerResult {
  const prevTailKeyRef = useRef<string | null>(null);
  const [newActivityCount, setNewActivityCount] = useState(0);

  useEffect(() => {
    if (nodes.length === 0) {
      prevTailKeyRef.current = null;
      return;
    }
    const tailKey = nodeKey(nodes[nodes.length - 1]);
    const prevTail = prevTailKeyRef.current;
    prevTailKeyRef.current = tailKey;
    if (!prevTail || prevTail === tailKey) return;
    const prevIdx = nodes.findIndex((n) => nodeKey(n) === prevTail);
    const delta = prevIdx === -1 ? 1 : nodes.length - 1 - prevIdx;
    if (delta <= 0) return;
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      return;
    }
    setNewActivityCount((c) => c + delta);
  }, [nodes, listRef, isNearBottomRef]);

  return {
    newActivityCount,
    clearNewActivity: () => setNewActivityCount(0),
  };
}
