import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FolderGit2, GitBranch } from "lucide-react";
import type { GitCheckpoint } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import { useComposerStore } from "../../stores/composer";
import { ImportWorktreeDialog } from "./ImportWorktreeDialog";
import type { SessionNode, AgentToolResult } from "./groupReadGlob";
import { SessionNodeRenderer } from "./SessionNodeRenderer";
import { CollapsedSessionEventsRow } from "./messages/CollapsedSessionEventsRow";
import type { CollapsedSessionEventsSummary } from "../../hooks/useSessionEvents";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import { TraceLoader } from "../ui/trace-loader";
import { PromptTimeline } from "./PromptTimeline";
import type { SessionPromptIndexItem } from "../../hooks/useSessionPromptIndex";
import { shouldFollowBottom } from "./sessionAutoScroll";

export type SessionListNode =
  | SessionNode
  | { kind: "collapsed-events"; id: string; collapsedRanges: CollapsedSessionEventsSummary[] };

function nodeKey(node: SessionListNode): string {
  if (node.kind === "readglob-group") return `rg:${node.items[0].id}`;
  return node.id;
}

// Height of the gradient fade above the floating composer.
const BOTTOM_FADE_HEIGHT = 48;

// Starter prompts shown on the session empty state. Clicking one sends it immediately.
const STARTER_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Explain this codebase",
    prompt: "Give me a high-level tour of how this codebase is organized.",
  },
  {
    label: "Summarize recent changes",
    prompt: "Summarize the most recent changes on this branch.",
  },
  {
    label: "Review the latest commit",
    prompt: "Review the latest commit and flag anything risky.",
  },
];

// Fallback height for rows the browser has not rendered yet (content-visibility
// placeholder sizing). Once a row has been on screen, `contain-intrinsic-size:
// auto` remembers its real size instead.
function estimateNodeHeight(node: SessionListNode): number {
  if (node.kind === "command-execution" || node.kind === "readglob-group") return 34;
  if (node.kind === "collapsed-events") return 28;
  if (node.kind === "ask-user-question") return 120;
  if (node.kind === "plan-review") return 320;
  return 88;
}


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
  onForkSession?: (eventId: string) => void;
  canForkSession?: boolean;
  messageActionsEventIds?: ReadonlySet<string>;
  /** Extra scrollable space at the bottom so content clears the floating composer. */
  scrollPaddingBottom?: number;
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
  messageActionsEventIds,
  scrollPaddingBottom,
}: SessionMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const wasLoadingOlderRef = useRef(false);
  const scrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isNearBottomRef = useRef(true);
  const previousScrollTopRef = useRef(0);
  const hasScrolledInitiallyRef = useRef(false);
  const pendingTimelineAnchorRef = useRef<string | null>(null);
  const currentIndexFrameRef = useRef<number | null>(null);
  const previousTouchYRef = useRef<number | null>(null);

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

  // Index of the node at the viewport anchor, for the prompt timeline.
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number | null>(null);

  const updateCurrentNodeIndex = useCallback(() => {
    const container = scrollContainerRef.current;
    const rowsEl = rowsContainerRef.current;
    if (!container || !rowsEl) return;
    const rows = rowsEl.children;
    if (rows.length === 0) {
      setCurrentNodeIndex(null);
      return;
    }
    const anchorY =
      container.getBoundingClientRect().top + Math.min(container.clientHeight * 0.25, 180);
    // Rows are in document order — binary search for the first row whose
    // bottom edge is at or below the viewport anchor.
    let lo = 0;
    let hi = rows.length - 1;
    let found = rows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = rows[mid].getBoundingClientRect();
      if (rect.bottom >= anchorY) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const indexAttr = (rows[found] as HTMLElement).dataset.index;
    setCurrentNodeIndex(indexAttr != null ? Number(indexAttr) : null);
  }, []);

  // Track whether the user is near the bottom, and keep the timeline anchor fresh.
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = shouldFollowBottom({
      wasFollowing: isNearBottomRef.current,
      previousScrollTop: previousScrollTopRef.current,
      scrollTop: container.scrollTop,
      distanceFromBottom,
    });
    previousScrollTopRef.current = container.scrollTop;

    if (currentIndexFrameRef.current == null) {
      currentIndexFrameRef.current = requestAnimationFrame(() => {
        currentIndexFrameRef.current = null;
        updateCurrentNodeIndex();
      });
    }
  }, [updateCurrentNodeIndex]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (currentIndexFrameRef.current != null) {
        cancelAnimationFrame(currentIndexFrameRef.current);
        currentIndexFrameRef.current = null;
      }
    };
  }, [handleScroll]);

  useEffect(() => {
    updateCurrentNodeIndex();
  }, [nodes, updateCurrentNodeIndex]);

  const captureScrollSnapshot = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || scrollSnapshotRef.current) return;
    // Suppress native scroll anchoring while the prepend is in flight: the
    // manual restore below owns the adjustment. Anchoring can't be relied on
    // for prepends anyway — browsers skip it when scrolled to the very top —
    // and letting both run would double-compensate.
    container.style.overflowAnchor = "none";
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

  // Restore scroll position after older messages are prepended, then hand
  // control back to native scroll anchoring.
  useLayoutEffect(() => {
    const snapshot = scrollSnapshotRef.current;
    const container = scrollContainerRef.current;
    if (!snapshot || !container || loadingOlder) return;

    const delta = container.scrollHeight - snapshot.scrollHeight;
    if (delta > 0) {
      container.scrollTop = snapshot.scrollTop + delta;
    }
    container.style.overflowAnchor = "";
    scrollSnapshotRef.current = null;
  }, [loadingOlder, nodes.length]);

  // Scroll to bottom on initial load, before paint so there is no flash at top.
  useLayoutEffect(() => {
    if (!isInitialLoadRef.current || initialLoading || nodes.length === 0) return;

    isInitialLoadRef.current = false;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    // Enable the load-older sentinel only after the initial position has
    // settled, so opening a session doesn't immediately fetch older pages.
    requestAnimationFrame(() => {
      hasScrolledInitiallyRef.current = true;
      handleScroll();
    });
  }, [handleScroll, initialLoading, nodes.length]);

  // Follow the bottom while content grows (streaming events, images loading,
  // panel resize). A single ResizeObserver on the content and the container
  // replaces per-item measurement: whenever heights change and the user was
  // near the bottom, re-pin to the bottom.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const rowsEl = rowsContainerRef.current;
    if (!container || !rowsEl) return;

    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(rowsEl);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // When the floating composer height changes (grows to multiple lines, or swaps
  // to a taller plan/question bar), the reserved bottom padding changes — re-pin
  // to the bottom if the user was already there so the newest message isn't hidden.
  const prevScrollPaddingRef = useRef(scrollPaddingBottom);
  useEffect(() => {
    if (prevScrollPaddingRef.current === scrollPaddingBottom) return;
    prevScrollPaddingRef.current = scrollPaddingBottom;
    const container = scrollContainerRef.current;
    if (!container || !isNearBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollPaddingBottom]);

  // Scroll to a specific event when requested (e.g. from checkpoint panel or prompt timeline)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);
  const [timelineScrollToEventId, setTimelineScrollToEventId] = useState<string | null>(null);
  const [scrollIntentVersion, setScrollIntentVersion] = useState(0);
  const requestedScrollToEventId = scrollToEventId ?? timelineScrollToEventId;

  const scrollToNodeIndex = useCallback((index: number, align: "center" | "start") => {
    const row = rowsContainerRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: align });
  }, []);

  useEffect(() => {
    if (!requestedScrollToEventId) return;
    const targetIndex = nodes.findIndex((n) => "id" in n && n.id === requestedScrollToEventId);
    if (targetIndex >= 0) {
      const align = requestedScrollToEventId === scrollToEventId ? "center" : "start";
      scrollToNodeIndex(targetIndex, align);
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
    scrollToNodeIndex,
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

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      handleUserScrollIntent();
      if (event.deltaY < 0) {
        isNearBottomRef.current = false;
      }
    },
    [handleUserScrollIntent],
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      handleUserScrollIntent();
      previousTouchYRef.current = event.touches[0]?.clientY ?? null;
    },
    [handleUserScrollIntent],
  );

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const currentY = event.touches[0]?.clientY;
    const previousY = previousTouchYRef.current;
    if (currentY == null) return;
    if (previousY != null && currentY > previousY) {
      isNearBottomRef.current = false;
    }
    previousTouchYRef.current = currentY;
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      handleUserScrollIntent();
      if (
        event.key === "ArrowUp" ||
        event.key === "PageUp" ||
        event.key === "Home" ||
        (event.key === " " && event.shiftKey)
      ) {
        isNearBottomRef.current = false;
      }
    },
    [handleUserScrollIntent],
  );

  const showEmptyState = !initialLoading && nodes.length === 0 && !loadingOlder;

  // Worktree import entry point (shown on the empty state). Adopting an existing
  // worktree only applies before a session starts, on local hosting, with a repo.
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const sessionRepo = useEntityField("sessions", sessionId, "repo") as
    | { id?: string; name?: string }
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const worktreeAdopted = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "worktreeAdopted",
  ) as boolean | undefined;
  const groupWorkdir = useEntityField("sessionGroups", sessionGroupId ?? "", "workdir") as
    | string
    | null
    | undefined;
  const groupBranch = useEntityField("sessionGroups", sessionGroupId ?? "", "branch") as
    | string
    | null
    | undefined;
  const [showImportWorktree, setShowImportWorktree] = useState(false);
  const requestPrefill = useComposerStore((s) => s.requestPrefill);
  const canImportWorktree =
    agentStatus === "not_started" && hosting !== "cloud" && Boolean(sessionRepo?.id);
  const importedWorktree = Boolean(worktreeAdopted);
  const repoName = sessionRepo?.name;

  const emptyState = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute inset-0 z-10"
    >
      <div
        className="h-full overflow-y-auto bg-background"
        style={scrollPaddingBottom ? { paddingBottom: scrollPaddingBottom } : undefined}
      >
        <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
          <div className="relative w-[90%]">
            {(repoName || groupBranch) && (
              <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                {repoName && (
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <FolderGit2 size={13} className="text-muted-foreground" />
                    {repoName}
                  </span>
                )}
                {repoName && groupBranch && <span className="text-border">/</span>}
                {groupBranch && (
                  <span className="flex items-center gap-1 font-mono">
                    <GitBranch size={11} className="shrink-0" />
                    {groupBranch}
                  </span>
                )}
              </div>
            )}

            <h2 className="text-base font-semibold tracking-tight text-foreground">
              What should the agent do?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with a suggestion, or type your own below.
            </p>

            <div className="pointer-events-auto mt-4 flex flex-wrap gap-2">
              {STARTER_PROMPTS.map(({ label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => requestPrefill(sessionId, prompt, true)}
                  className="group flex h-28 w-full max-w-[230px] flex-1 flex-col items-start overflow-hidden rounded-lg border border-border bg-surface-deep p-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-elevated"
                >
                  <span className="line-clamp-4 text-sm leading-snug text-foreground">{label}</span>
                </button>
              ))}
            </div>

            {importedWorktree ? (
              <div className="pointer-events-auto mt-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-deep px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <FolderGit2 size={14} className="text-muted-foreground" />
                  Imported from worktree
                </span>
                {groupWorkdir && (
                  <span className="max-w-full truncate pl-6 font-mono text-[11px] text-muted-foreground">
                    {groupWorkdir}
                  </span>
                )}
              </div>
            ) : (
              canImportWorktree && (
                <button
                  type="button"
                  onClick={() => setShowImportWorktree(true)}
                  className="pointer-events-auto mt-4 flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <FolderGit2 size={13} className="shrink-0" />
                  Working from an existing checkout? Import from worktree
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="relative h-full">
      {canImportWorktree && sessionRepo?.id && (
        <ImportWorktreeDialog
          sessionId={sessionId}
          repoId={sessionRepo.id}
          open={showImportWorktree}
          onClose={() => setShowImportWorktree(false)}
        />
      )}
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
        className="h-full overflow-y-auto px-4"
        style={
          scrollPaddingBottom
            ? {
                paddingBottom: scrollPaddingBottom,
                maskImage: `linear-gradient(to bottom, #000 calc(100% - ${scrollPaddingBottom + BOTTOM_FADE_HEIGHT}px), transparent calc(100% - ${scrollPaddingBottom}px))`,
                WebkitMaskImage: `linear-gradient(to bottom, #000 calc(100% - ${scrollPaddingBottom + BOTTOM_FADE_HEIGHT}px), transparent calc(100% - ${scrollPaddingBottom}px))`,
              }
            : undefined
        }
        onKeyDown={handleKeyDown}
        onPointerDown={handleUserScrollIntent}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onWheel={handleWheel}
      >
        <div className="mx-auto w-[90%] py-4">
          {/* Sentinel for infinite scroll - triggers loading older messages */}
          <div ref={sentinelRef} className="h-px w-px" />

          {!hasOlder && nodes.length > 0 && (
            <div className="flex h-8 items-center justify-center text-center text-xs text-muted-foreground">
              Beginning of session
            </div>
          )}

          <SessionMessageRows
            rowsRef={rowsContainerRef}
            nodes={nodes}
            sessionId={sessionId}
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
            messageActionsEventIds={messageActionsEventIds}
          />
        </div>
      </div>
    </div>
  );
}

interface SessionMessageRowsProps {
  rowsRef: React.RefObject<HTMLDivElement | null>;
  nodes: SessionListNode[];
  sessionId: string;
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  highlightEventId: string | null;
  activePlanId?: string | null;
  planComments?: MarkdownSteerCommentsByBlock;
  onAddPlanComment?: (block: MarkdownSteerBlock, text: string) => void;
  onRemovePlanComment?: (blockId: string, commentId: string) => void;
  onForkSession?: (eventId: string) => void;
  canForkSession: boolean;
  messageActionsEventIds?: ReadonlySet<string>;
}

// Memoized so scroll-driven state in the parent (timeline anchor index,
// scroll-intent version) doesn't reconcile every row on each scroll frame.
const SessionMessageRows = memo(function SessionMessageRows({
  rowsRef,
  nodes,
  sessionId,
  gitCheckpointsByPromptEventId,
  completedAgentTools,
  toolResultByUseId,
  highlightEventId,
  activePlanId,
  planComments,
  onAddPlanComment,
  onRemovePlanComment,
  onForkSession,
  canForkSession,
  messageActionsEventIds,
}: SessionMessageRowsProps) {
  return (
    <div ref={rowsRef} className="w-full">
      {nodes.map((node, index) => (
        <div
          key={nodeKey(node)}
          data-index={index}
          className="w-full pb-3"
          // Skip layout and paint for offscreen rows — browser-native
          // virtualization without JS-managed positioning.
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: `auto ${estimateNodeHeight(node)}px`,
          }}
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
              messageActionsEventIds={messageActionsEventIds}
            />
          )}
        </div>
      ))}
    </div>
  );
});
