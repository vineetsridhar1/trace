import { useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { SessionMessage } from "./SessionMessage";
import { ReadGlobGroup } from "./messages/ReadGlobGroup";
import { PlanReviewCard } from "./messages/PlanReviewCard";
import { AskUserQuestionInline } from "./messages/AskUserQuestionInline";
import { CommandExecutionRow } from "./messages/CommandExecutionRow";
import type { SessionNode } from "./groupReadGlob";

interface SessionMessageListProps {
  nodes: SessionNode[];
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

export function SessionMessageList({
  nodes,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: SessionMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevNodeCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const wasLoadingOlderRef = useRef(false);
  const scrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isNearBottomRef = useRef(true);

  // Track whether the user is near the bottom via scroll events
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
  useEffect(() => {
    const snapshot = scrollSnapshotRef.current;
    const container = scrollContainerRef.current;
    if (!snapshot || !container || loadingOlder) return;

    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = snapshot.scrollTop + (newScrollHeight - snapshot.scrollHeight);
      scrollSnapshotRef.current = null;
    });
  }, [loadingOlder, nodes.length]);

  // Scroll to bottom on initial load and when new messages arrive at the end
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isInitialLoadRef.current) {
      bottomRef.current?.scrollIntoView();
      isInitialLoadRef.current = false;
      prevNodeCountRef.current = nodes.length;
      return;
    }

    const prevCount = prevNodeCountRef.current;
    prevNodeCountRef.current = nodes.length;

    // Don't auto-scroll when older messages were prepended
    if (scrollSnapshotRef.current) return;
    if (nodes.length <= prevCount) return;

    // Only auto-scroll if the user was near the bottom (within 100px)
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [nodes.length]);

  // IntersectionObserver on the sentinel to trigger loading older messages
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
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

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 max-h-full">
      <div className="flex flex-col gap-3">
        {/* Sentinel for infinite scroll - triggers loading older messages */}
        <div ref={sentinelRef} className="h-px" />

        {loadingOlder && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading older messages…</span>
          </div>
        )}

        {!hasOlder && nodes.length > 0 && (
          <div className="text-center text-xs text-muted-foreground py-2">Beginning of session</div>
        )}

        {nodes.map((node) =>
          node.kind === "event" ? (
            <SessionMessage key={node.id} id={node.id} />
          ) : node.kind === "command-execution" ? (
            <CommandExecutionRow
              key={node.id}
              command={node.command}
              output={node.output}
              timestamp={node.timestamp}
              exitCode={node.exitCode}
            />
          ) : node.kind === "plan-review" ? (
            <PlanReviewCard
              key={node.id}
              planContent={node.planContent}
              planFilePath={node.planFilePath}
              timestamp={node.timestamp}
            />
          ) : node.kind === "ask-user-question" ? (
            <AskUserQuestionInline
              key={node.id}
              questions={node.questions}
              timestamp={node.timestamp}
            />
          ) : (
            <ReadGlobGroup key={node.items[0].id} items={node.items} />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
