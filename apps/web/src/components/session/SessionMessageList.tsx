import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import type { GitCheckpoint } from "@trace/gql";
import { SessionMessage } from "./SessionMessage";
import { ReadGlobGroup } from "./messages/ReadGlobGroup";
import { PlanReviewCard } from "./messages/PlanReviewCard";
import { AskUserQuestionInline } from "./messages/AskUserQuestionInline";
import { CommandExecutionRow } from "./messages/CommandExecutionRow";
import type { SessionNode, AgentToolResult } from "./groupReadGlob";

export interface SessionMessageListProps {
  key?: React.Key;
  nodes: SessionNode[];
  gitCheckpoints: GitCheckpoint[];
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  scrollToEventId?: string | null;
  onScrollComplete?: () => void;
}

export function SessionMessageList({
  nodes,
  gitCheckpoints,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  completedAgentTools,
  toolResultByUseId,
  scrollToEventId,
  onScrollComplete,
}: SessionMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevNodeCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const wasLoadingOlderRef = useRef(false);
  const scrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isNearBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef(false);
  const isScrollingUpRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const sizeCacheRef = useRef(new Map<string, number>());

  const gitCheckpointsByPromptEventId = useMemo(() => {
    const byPromptEventId = new Map<string, GitCheckpoint[]>();
    for (const checkpoint of gitCheckpoints) {
      const existing = byPromptEventId.get(checkpoint.promptEventId) ?? [];
      existing.push(checkpoint);
      byPromptEventId.set(checkpoint.promptEventId, existing);
    }
    for (const checkpoints of byPromptEventId.values()) {
      checkpoints.sort((a, b) => a.committedAt.localeCompare(b.committedAt));
    }
    return byPromptEventId;
  }, [gitCheckpoints]);

  const getItemKey = useCallback(
    (index: number) => {
      const node = nodes[index];
      return node.kind === "readglob-group" ? `rg:${node.items[0].id}` : node.id;
    },
    [nodes],
  );

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index: number) => sizeCacheRef.current.get(getItemKey(index)) ?? 80,
    overscan: 20,
    getItemKey,
    measureElement: (element: Element) => {
      const height = element.getBoundingClientRect().height;
      const index = element.getAttribute("data-index");
      if (index != null) {
        sizeCacheRef.current.set(getItemKey(Number(index)), height);
      }
      return height;
    },
  });

  // Track whether the user is near the bottom and scroll direction
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 100;
    isScrollingUpRef.current = container.scrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = container.scrollTop;
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Correct scroll position when measurements change during upward scroll.
  // When items above the viewport are measured for the first time, the total
  // virtual height changes, which shifts content and causes visible jumps.
  // We detect the height delta and compensate by adjusting scrollTop.
  const prevTotalSizeRef = useRef(0);
  const prevNodeCountForCorrectionRef = useRef(nodes.length);
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasScrolledInitiallyRef.current) return;
    if (scrollSnapshotRef.current) return;

    const totalSize = virtualizer.getTotalSize();
    const prevTotal = prevTotalSizeRef.current;
    prevTotalSizeRef.current = totalSize;

    const nodeCountChanged = nodes.length !== prevNodeCountForCorrectionRef.current;
    prevNodeCountForCorrectionRef.current = nodes.length;
    if (nodeCountChanged) return;

    if (prevTotal > 0 && isScrollingUpRef.current) {
      const delta = totalSize - prevTotal;
      if (delta !== 0) {
        container.scrollTop += delta;
      }
    }
  });

  // Capture scroll position when older messages start loading
  useEffect(() => {
    if (loadingOlder && !wasLoadingOlderRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        scrollSnapshotRef.current = {
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
        };
      }
    }
    wasLoadingOlderRef.current = !!loadingOlder;
  }, [loadingOlder]);

  // Restore scroll position after older messages are prepended
  useLayoutEffect(() => {
    const snapshot = scrollSnapshotRef.current;
    const container = scrollContainerRef.current;
    if (!snapshot || !container || loadingOlder) return;

    const newScrollHeight = container.scrollHeight;
    const delta = newScrollHeight - snapshot.scrollHeight;
    if (delta > 0) {
      container.scrollTop = snapshot.scrollTop + delta;
    }
    scrollSnapshotRef.current = null;
  }, [loadingOlder, nodes.length]);

  // Scroll to bottom on initial load — use useLayoutEffect + rAF to ensure
  // the virtualizer has rendered and measured before scrolling
  useLayoutEffect(() => {
    if (!isInitialLoadRef.current || nodes.length === 0) return;

    isInitialLoadRef.current = false;
    prevNodeCountRef.current = nodes.length;

    // First pass: jump immediately (before paint) to avoid flash at top
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }

    // Second pass: after the virtualizer measures, scroll precisely to the last item
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(nodes.length - 1, { align: "end" });
      // Mark that initial scroll is complete — sentinel observer can now activate
      requestAnimationFrame(() => {
        hasScrolledInitiallyRef.current = true;
      });
    });
  }, [nodes.length, virtualizer]);

  // Auto-scroll when new messages arrive at the end
  useEffect(() => {
    if (isInitialLoadRef.current) return;

    const prevCount = prevNodeCountRef.current;
    prevNodeCountRef.current = nodes.length;

    if (nodes.length <= prevCount) return;

    // Only auto-scroll if the user was near the bottom (within 100px).
    // Use rAF so the virtualizer measures the new item before we scroll —
    // without this, scrollToIndex may snap because the target size is unknown.
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(nodes.length - 1, { align: "end", behavior: "smooth" });
      });
    }
  }, [nodes.length, virtualizer]);

  // Scroll to a specific event when requested (e.g. from checkpoint panel)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToEventId) return;
    const targetIndex = nodes.findIndex((n) => n.kind !== "readglob-group" && n.id === scrollToEventId);
    if (targetIndex >= 0) {
      virtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "smooth" });
      setHighlightEventId(scrollToEventId);
      const timer = setTimeout(() => setHighlightEventId(null), 2000);
      onScrollComplete?.();
      return () => clearTimeout(timer);
    }
    // Target not in DOM yet — load older events if available
    if (hasOlder && onLoadOlder && !loadingOlder) {
      onLoadOlder();
    } else if (!hasOlder) {
      onScrollComplete?.();
    }
  }, [scrollToEventId, onScrollComplete, nodes, hasOlder, loadingOlder, onLoadOlder, virtualizer]);

  // IntersectionObserver on the sentinel to trigger loading older messages.
  // Only activates after the initial scroll-to-bottom completes to avoid
  // eagerly loading all events on open.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!hasScrolledInitiallyRef.current) return;
        if (entries[0].isIntersecting && onLoadOlder) {
          onLoadOlder();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px 0px 0px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadOlder]);

  const virtualItems = virtualizer.getVirtualItems();
  const isEmpty = nodes.length === 0 && !loadingOlder;
  const [showEmptyState, setShowEmptyState] = useState(isEmpty);

  useEffect(() => {
    if (isEmpty) setShowEmptyState(true);
  }, [isEmpty]);

  const emptyState = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onAnimationComplete={() => {
        if (!isEmpty) setShowEmptyState(false);
      }}
      className="absolute inset-0 z-10"
    >
      <div className="h-full overflow-y-auto bg-background">
        <div className="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-surface-deep/80 to-transparent" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" />

          <div className="relative flex max-w-sm flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-deep text-muted-foreground shadow-sm">
              <Sparkles size={20} />
            </div>
            <p className="text-base font-medium text-foreground">New session</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask the agent to inspect code, make a change, or answer a question to get started.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );

  if (isEmpty) {
    return <div className="relative h-full">{emptyState}</div>;
  }

  return (
    <div className="relative h-full">
      <AnimatePresence>{showEmptyState ? emptyState : null}</AnimatePresence>

      <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 py-4">
        {/* Sentinel for infinite scroll - triggers loading older messages */}
        <div ref={sentinelRef} className="h-px" />

        {loadingOlder && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading older messages…</span>
          </div>
        )}

        {!hasOlder && nodes.length > 0 && (
          <div className="py-2 text-center text-xs text-muted-foreground">Beginning of session</div>
        )}

        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow: { key: React.Key; index: number; start: number }) => {
            const node = nodes[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="pb-3"
              >
                {node.kind === "event" ? (
                  <div
                    data-event-id={node.id}
                    className={highlightEventId === node.id ? "rounded-lg ring-2 ring-primary/50 transition-all duration-500" : undefined}
                  >
                    <SessionMessage
                      id={node.id}
                      gitCheckpointsByPromptEventId={gitCheckpointsByPromptEventId}
                      completedAgentTools={completedAgentTools}
                      toolResultByUseId={toolResultByUseId}
                    />
                  </div>
                ) : node.kind === "command-execution" ? (
                  <CommandExecutionRow
                    command={node.command}
                    output={node.output}
                    timestamp={node.timestamp}
                    exitCode={node.exitCode}
                  />
                ) : node.kind === "plan-review" ? (
                  <PlanReviewCard
                    planContent={node.planContent}
                    planFilePath={node.planFilePath}
                    timestamp={node.timestamp}
                  />
                ) : node.kind === "ask-user-question" ? (
                  <AskUserQuestionInline
                    questions={node.questions}
                    timestamp={node.timestamp}
                  />
                ) : (
                  <ReadGlobGroup items={node.items} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
