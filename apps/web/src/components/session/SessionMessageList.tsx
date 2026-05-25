import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { GitCheckpoint } from "@trace/gql";
import type { SessionNode, AgentToolResult } from "./groupReadGlob";
import { SessionNodeRenderer } from "./SessionNodeRenderer";
import { CollapsedSessionEventsRow } from "./messages/CollapsedSessionEventsRow";
import type { CollapsedSessionEventsSummary } from "../../hooks/useSessionEvents";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import { TraceLoader } from "../ui/trace-loader";
import { PromptTimeline } from "./PromptTimeline";
import type { SessionPromptIndexItem } from "../../hooks/useSessionPromptIndex";

// DetailPanel animates flex-basis for 300ms; the final pass runs just after it settles.
const INITIAL_SCROLL_SETTLE_DELAYS = [0, 80, 180, 360] as const;
const LIST_VERTICAL_PADDING = 16;
const BEGINNING_LABEL_HEIGHT = 32;

export type SessionListNode =
  | SessionNode
  | { kind: "collapsed-events"; id: string; collapsedRanges: CollapsedSessionEventsSummary[] };

export interface SessionMessageListProps {
  key?: React.Key;
  sessionId: string;
  nodes: SessionListNode[];
  promptIndexItems: SessionPromptIndexItem[];
  gitCheckpoints: GitCheckpoint[];
  initialLoading?: boolean;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onLoadAroundEvent?: (eventId: string) => Promise<boolean>;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  scrollToEventId?: string | null;
  onScrollComplete?: () => void;
  activePlanId?: string | null;
  planComments?: MarkdownSteerCommentsByBlock;
  onAddPlanComment?: (block: MarkdownSteerBlock, text: string) => void;
  onRemovePlanComment?: (blockId: string, commentId: string) => void;
  onForkSession?: () => void;
  canForkSession?: boolean;
}

export function SessionMessageList({
  sessionId,
  nodes,
  promptIndexItems,
  gitCheckpoints,
  initialLoading = false,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onLoadAroundEvent,
  completedAgentTools,
  toolResultByUseId,
  scrollToEventId,
  onScrollComplete,
  activePlanId,
  planComments,
  onAddPlanComment,
  onRemovePlanComment,
  onForkSession,
  canForkSession = false,
}: SessionMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevNodeCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const wasLoadingOlderRef = useRef(false);
  const scrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isNearBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef(false);
  const sizeCacheRef = useRef(new Map<string, number>());
  const initialBottomAligningRef = useRef(false);
  const initialScrollTimeoutsRef = useRef<number[]>([]);
  const initialScrollFramesRef = useRef<number[]>([]);
  const pendingTimelineAnchorRef = useRef<string | null>(null);
  const nodeCountRef = useRef(nodes.length);
  nodeCountRef.current = nodes.length;

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
      if (node.kind === "readglob-group") return `rg:${node.items[0].id}`;
      if (node.kind === "collapsed-events") return node.id;
      return node.id;
    },
    [nodes],
  );

  const estimateNodeSize = useCallback(
    (index: number) => {
      const cached = sizeCacheRef.current.get(getItemKey(index));
      if (cached != null) return cached;

      const node = nodes[index];
      if (!node) return 80;
      if (node.kind === "command-execution") return 34;
      if (node.kind === "readglob-group") return 34;
      if (node.kind === "collapsed-events") return 28;
      if (node.kind === "ask-user-question") return 120;
      if (node.kind === "plan-review") return 320;
      return 88;
    },
    [getItemKey, nodes],
  );

  const topPadding =
    LIST_VERTICAL_PADDING + (!hasOlder && nodes.length > 0 ? BEGINNING_LABEL_HEIGHT : 0);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: estimateNodeSize,
    overscan: 24,
    paddingStart: topPadding,
    paddingEnd: LIST_VERTICAL_PADDING,
    getItemKey,
    useAnimationFrameWithResizeObserver: true,
    measureElement: (element: Element) => {
      const height = element.getBoundingClientRect().height;
      const index = element.getAttribute("data-index");
      if (index != null) {
        sizeCacheRef.current.set(getItemKey(Number(index)), height);
      }
      return height;
    },
  });

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    const container = scrollContainerRef.current;
    return !!container && item.end < container.scrollTop;
  };

  // Track whether the user is near the bottom.
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 100;
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const alignToBottomAfterMeasure = useCallback(
    (markComplete = false) => {
      const container = scrollContainerRef.current;
      const nodeCount = nodeCountRef.current;
      if (!container || nodeCount === 0) return;

      virtualizer.measure();
      virtualizer.scrollToIndex(nodeCount - 1, { align: "end" });

      if (markComplete) {
        hasScrolledInitiallyRef.current = true;
        initialBottomAligningRef.current = false;
        handleScroll();
      }
    },
    [handleScroll, virtualizer],
  );

  const clearInitialScrollTimers = useCallback(() => {
    for (const timeoutId of initialScrollTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    for (const frameId of initialScrollFramesRef.current) {
      window.cancelAnimationFrame(frameId);
    }
    initialScrollTimeoutsRef.current = [];
    initialScrollFramesRef.current = [];
  }, []);

  const scheduleInitialBottomAlignment = useCallback(() => {
    clearInitialScrollTimers();
    initialBottomAligningRef.current = true;

    INITIAL_SCROLL_SETTLE_DELAYS.forEach((delay, index) => {
      const timeoutId = window.setTimeout(() => {
        const frameId = window.requestAnimationFrame(() => {
          const isFinalPass = index === INITIAL_SCROLL_SETTLE_DELAYS.length - 1;
          alignToBottomAfterMeasure(isFinalPass);
        });
        initialScrollFramesRef.current.push(frameId);
      }, delay);
      initialScrollTimeoutsRef.current.push(timeoutId);
    });
  }, [alignToBottomAfterMeasure, clearInitialScrollTimers]);

  useEffect(() => clearInitialScrollTimers, [clearInitialScrollTimers]);

  const totalSize = virtualizer.getTotalSize();

  const captureScrollSnapshot = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || scrollSnapshotRef.current) return;
    scrollSnapshotRef.current = {
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
    };
  }, []);

  const loadOlderPreservingScroll = useCallback(() => {
    if (!onLoadOlder || loadingOlder || hasOlder === false) return;
    captureScrollSnapshot();
    onLoadOlder();
  }, [captureScrollSnapshot, hasOlder, loadingOlder, onLoadOlder]);

  // Capture scroll position when older messages start loading. The normal path
  // captures synchronously before setting loadingOlder; this is only a fallback.
  useEffect(() => {
    if (loadingOlder && !wasLoadingOlderRef.current) {
      captureScrollSnapshot();
    }
    wasLoadingOlderRef.current = !!loadingOlder;
  }, [captureScrollSnapshot, loadingOlder]);

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
    if (!isInitialLoadRef.current || initialLoading || nodes.length === 0) return;

    isInitialLoadRef.current = false;
    prevNodeCountRef.current = nodes.length;

    // First pass: jump immediately (before paint) to avoid flash at top
    const container = scrollContainerRef.current;
    if (container) {
      virtualizer.measure();
      container.scrollTop = container.scrollHeight;
    }

    scheduleInitialBottomAlignment();
  }, [initialLoading, nodes.length, scheduleInitialBottomAlignment, virtualizer]);

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

  // Scroll to a specific event when requested (e.g. from checkpoint panel or prompt timeline)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);
  const [timelineScrollToEventId, setTimelineScrollToEventId] = useState<string | null>(null);
  const [scrollIntentVersion, setScrollIntentVersion] = useState(0);
  const requestedScrollToEventId = scrollToEventId ?? timelineScrollToEventId;

  useEffect(() => {
    if (!requestedScrollToEventId) return;
    const targetIndex = nodes.findIndex((n) => "id" in n && n.id === requestedScrollToEventId);
    if (targetIndex >= 0) {
      const align = requestedScrollToEventId === scrollToEventId ? "center" : "start";
      virtualizer.scrollToIndex(targetIndex, { align, behavior: "smooth" });
      if (requestedScrollToEventId === scrollToEventId) {
        setHighlightEventId(requestedScrollToEventId);
        onScrollComplete?.();
        const timer = setTimeout(() => setHighlightEventId(null), 2000);
        return () => clearTimeout(timer);
      } else {
        setHighlightEventId(null);
        setTimelineScrollToEventId(null);
        pendingTimelineAnchorRef.current = null;
      }
      return;
    }
    if (
      requestedScrollToEventId !== scrollToEventId &&
      onLoadAroundEvent &&
      pendingTimelineAnchorRef.current !== requestedScrollToEventId
    ) {
      pendingTimelineAnchorRef.current = requestedScrollToEventId;
      void onLoadAroundEvent(requestedScrollToEventId)
        .then((found) => {
          pendingTimelineAnchorRef.current = null;
          if (!found) {
            setTimelineScrollToEventId((current) =>
              current === requestedScrollToEventId ? null : current,
            );
          }
        })
        .catch(() => {
          pendingTimelineAnchorRef.current = null;
          setTimelineScrollToEventId((current) =>
            current === requestedScrollToEventId ? null : current,
          );
        });
      return;
    }
    // Target not in DOM yet — load older events if available
    if (hasOlder && onLoadOlder && !loadingOlder) {
      loadOlderPreservingScroll();
    } else if (!hasOlder) {
      if (requestedScrollToEventId === scrollToEventId) {
        onScrollComplete?.();
      } else {
        setTimelineScrollToEventId(null);
      }
    }
  }, [
    requestedScrollToEventId,
    scrollToEventId,
    onScrollComplete,
    nodes,
    hasOlder,
    loadingOlder,
    onLoadAroundEvent,
    onLoadOlder,
    loadOlderPreservingScroll,
    virtualizer,
  ]);

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
          loadOlderPreservingScroll();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px 0px 0px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderPreservingScroll, onLoadOlder]);

  const handleUserScrollIntent = useCallback(() => {
    setScrollIntentVersion((version) => version + 1);
  }, []);

  const virtualItems = virtualizer.getVirtualItems();
  const currentNodeIndex = (() => {
    if (virtualItems.length === 0) return null;

    const container = scrollContainerRef.current;
    if (!container) return virtualItems[0].index;

    const viewportAnchor = container.scrollTop + Math.min(container.clientHeight * 0.25, 180);
    const currentItem = virtualItems.find((item) => item.start + item.size >= viewportAnchor);
    return currentItem?.index ?? virtualItems[virtualItems.length - 1].index;
  })();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const paddingTop = firstVirtualItem?.start ?? 0;
  const paddingBottom = lastVirtualItem ? Math.max(0, totalSize - lastVirtualItem.end) : 0;
  const showEmptyState = !initialLoading && nodes.length === 0 && !loadingOlder;

  const emptyState = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
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
            <p className="text-sm leading-6 text-muted-foreground">
              Ask the agent to inspect code, make a change, or answer a question to get started.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="relative h-full">
      {showEmptyState ? emptyState : null}
      {!showEmptyState ? (
        <PromptTimeline
          nodes={nodes}
          prompts={promptIndexItems}
          currentNodeIndex={currentNodeIndex}
          scrollIntentVersion={scrollIntentVersion}
          onSelectPrompt={setTimelineScrollToEventId}
        />
      ) : null}

      {loadingOlder && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex items-center justify-center">
          <div className="flex items-center rounded-full border border-border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur">
            <TraceLoader size={16} showLabel={false} />
            <span className="ml-2 text-sm text-muted-foreground">Loading older messages…</span>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto px-4 [overflow-anchor:none]"
        onKeyDown={handleUserScrollIntent}
        onPointerDown={handleUserScrollIntent}
        onTouchStart={handleUserScrollIntent}
        onWheel={handleUserScrollIntent}
      >
        <div className="w-full px-7 [overflow-anchor:none]" style={{ minHeight: totalSize }}>
          {/* Sentinel for infinite scroll - triggers loading older messages */}
          <div aria-hidden={paddingTop <= 0} className="relative" style={{ height: paddingTop }}>
            <div ref={sentinelRef} className="h-px w-px" />

            {!hasOlder && nodes.length > 0 && (
              <div
                className="absolute left-0 right-0 text-center text-xs text-muted-foreground"
                style={{ top: LIST_VERTICAL_PADDING, height: BEGINNING_LABEL_HEIGHT }}
              >
                Beginning of session
              </div>
            )}
          </div>

          {virtualItems.map((virtualRow: { key: React.Key; index: number }) => {
            const node = nodes[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="w-full pb-3"
              >
                {node.kind === "collapsed-events" ? (
                  <CollapsedSessionEventsRow
                    sessionId={sessionId}
                    collapsedRanges={node.collapsedRanges}
                    gitCheckpointsByPromptEventId={gitCheckpointsByPromptEventId}
                  />
                ) : (
                  <SessionNodeRenderer
                    node={node}
                    gitCheckpointsByPromptEventId={gitCheckpointsByPromptEventId}
                    completedAgentTools={completedAgentTools}
                    toolResultByUseId={toolResultByUseId}
                    highlightEventId={highlightEventId}
                    activePlanId={activePlanId}
                    planComments={planComments}
                    onAddPlanComment={onAddPlanComment}
                    onRemovePlanComment={onRemovePlanComment}
                    onForkSession={onForkSession}
                    canForkSession={canForkSession}
                  />
                )}
              </div>
            );
          })}

          {paddingBottom > 0 ? <div aria-hidden="true" style={{ height: paddingBottom }} /> : null}
        </div>
      </div>
    </div>
  );
}
