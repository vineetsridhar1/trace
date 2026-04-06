import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useBranchTimeline, type TimelineEntry } from "../hooks/useAiConversationSelectors";
import { useEntityStore } from "../../../stores/entity";
import { TurnItem } from "./TurnItem";
import { ForkSeparator } from "./ForkSeparator";
import { SummaryNode } from "./SummaryNode";
import { TypingIndicator } from "./TypingIndicator";
import { EmptyConversation } from "./EmptyConversation";
import { Button } from "../../../components/ui/button";

export function TurnList({ branchId }: { branchId: string }) {
  const timeline = useBranchTimeline(branchId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const wasAtBottomRef = useRef(true);
  const prevLengthRef = useRef(timeline.length);

  // Check if AI is generating
  const isAiGenerating = useEntityStore((state) => {
    const branch = state.aiBranches[branchId];
    if (!branch || branch.turnIds.length === 0) return false;
    const lastTurnId = branch.turnIds[branch.turnIds.length - 1];
    const lastTurn = state.aiTurns[lastTurnId];
    return lastTurn?.role === "USER" && !lastTurn._optimistic;
  });

  // Items = timeline entries + optional typing indicator
  const itemCount = timeline.length + (isAiGenerating ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      if (index >= timeline.length) return 40; // typing indicator
      const entry = timeline[index];
      if (entry.type === "fork-separator") return 32;
      if (entry.type === "summary") return 72;
      return 80;
    },
    overscan: 5,
  });

  // Scroll to bottom on new items
  useEffect(() => {
    if (timeline.length > prevLengthRef.current && wasAtBottomRef.current) {
      virtualizer.scrollToIndex(itemCount - 1, { align: "end", behavior: "smooth" });
    }
    prevLengthRef.current = timeline.length;
  }, [timeline.length, itemCount, virtualizer]);

  // Initial scroll to bottom
  useEffect(() => {
    if (itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: "end" });
    }
    // Only on mount / branchId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    wasAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(itemCount - 1, { align: "end", behavior: "smooth" });
  }, [virtualizer, itemCount]);

  if (timeline.length === 0 && !isAiGenerating) {
    return <EmptyConversation />;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const index = virtualItem.index;

            if (index >= timeline.length) {
              // Typing indicator
              return (
                <div
                  key="typing-indicator"
                  className="absolute left-0 top-0 w-full px-4"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                >
                  <TypingIndicator />
                </div>
              );
            }

            const entry = timeline[index];
            return (
              <div
                key={entryKey(entry, index)}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
              >
                <AnimatePresence mode="popLayout">
                  <TimelineItem entry={entry} />
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {showScrollButton && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 rounded-full shadow-md"
            onClick={scrollToBottom}
          >
            <ArrowDown size={14} />
            Scroll to bottom
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  switch (entry.type) {
    case "inherited-turn":
    case "local-turn":
      return <TurnItem turnId={entry.turnId} inherited={entry.type === "inherited-turn"} />;
    case "fork-separator":
      return <ForkSeparator parentBranchLabel={entry.parentBranchLabel} />;
    case "summary":
      return (
        <SummaryNode
          summaryId={entry.summaryId}
          branchId={entry.branchId}
          summarizedTurnCount={entry.summarizedTurnCount}
        />
      );
  }
}

function entryKey(entry: TimelineEntry, index: number): string {
  switch (entry.type) {
    case "inherited-turn":
    case "local-turn":
      return `turn-${entry.turnId}`;
    case "fork-separator":
      return `fork-${entry.forkTurnId}-${index}`;
    case "summary":
      return `summary-${entry.summaryId}-${index}`;
  }
}
