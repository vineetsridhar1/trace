import { useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useBranchTimeline,
  type TimelineEntry,
} from "../hooks/useAiConversationSelectors";
import {
  useBranchTimelineQuery,
} from "../hooks/useAiConversationQueries";
import {
  useBranchTurnsSubscription,
} from "../hooks/useAiConversationSubscriptions";
import { TurnItem } from "./TurnItem";
import { ForkSeparator } from "./ForkSeparator";

interface BranchTimelineProps {
  branchId: string;
  onFocusInput?: () => void;
}

export function BranchTimeline({
  branchId,
  onFocusInput,
}: BranchTimelineProps) {
  const { loading } = useBranchTimelineQuery(branchId);
  const timeline = useBranchTimeline(branchId);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to new turns on the active branch
  useBranchTurnsSubscription(branchId);

  // Scroll to bottom when new turns arrive
  useEffect(() => {
    if (timeline.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [timeline.length]);

  const handleForked = useCallback((_branchId: string) => {
    // After forking, focus the input so the user can start typing
    onFocusInput?.();
  }, [onFocusInput]);

  if (loading && timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading conversation...
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Start a conversation by typing below.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <AnimatePresence initial={false}>
        {timeline.map((entry) => (
          <TimelineEntryRenderer
            key={entryKey(entry)}
            entry={entry}
            onForked={handleForked}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}

function TimelineEntryRenderer({
  entry,
  onForked,
}: {
  entry: TimelineEntry;
  onForked?: (branchId: string) => void;
}) {
  switch (entry.type) {
    case "inherited-turn":
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <TurnItem
            turnId={entry.turnId}
            inherited
            onForked={onForked}
          />
        </motion.div>
      );

    case "fork-separator":
      return (
        <motion.div
          initial={{ opacity: 0, scaleX: 0.8 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ForkSeparator parentBranchLabel={entry.parentBranchLabel} />
        </motion.div>
      );

    case "local-turn":
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <TurnItem turnId={entry.turnId} onForked={onForked} />
        </motion.div>
      );
  }
}

function entryKey(entry: TimelineEntry): string {
  switch (entry.type) {
    case "inherited-turn":
      return `inherited-${entry.turnId}`;
    case "fork-separator":
      return `separator-${entry.forkTurnId}`;
    case "local-turn":
      return `local-${entry.turnId}`;
  }
}
