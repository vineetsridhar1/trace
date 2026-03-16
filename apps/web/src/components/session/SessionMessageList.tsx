import { useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { SessionMessage } from "./SessionMessage";
import { ReadGlobGroup } from "./messages/ReadGlobGroup";
import { PlanReviewCard } from "./messages/PlanReviewCard";
import { CommandExecutionRow } from "./messages/CommandExecutionRow";
import type { SessionNode } from "./groupReadGlob";

interface SessionMessageListProps {
  eventIds: string[];
  nodes: SessionNode[];
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

export function SessionMessageList({
  eventIds,
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

  // Scroll to bottom on initial load and when new messages arrive at the end
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isInitialLoadRef.current) {
      // Initial load — snap to bottom
      bottomRef.current?.scrollIntoView();
      isInitialLoadRef.current = false;
      prevNodeCountRef.current = nodes.length;
      return;
    }

    const prevCount = prevNodeCountRef.current;
    prevNodeCountRef.current = nodes.length;

    if (nodes.length <= prevCount) return;

    // Only auto-scroll if the user is near the bottom (within 150px)
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [nodes.length]);

  // IntersectionObserver on the sentinel to trigger loading older messages
  const handleSentinel = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry.isIntersecting && hasOlder && !loadingOlder && onLoadOlder) {
        onLoadOlder();
      }
    },
    [hasOlder, loadingOlder, onLoadOlder],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleSentinel, {
      root: scrollContainerRef.current,
      rootMargin: "200px 0px 0px 0px", // trigger 200px before reaching top
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleSentinel]);

  // Preserve scroll position when older messages are prepended
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !loadingOlder) return;

    // Capture scroll state before the DOM updates from new older messages
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    return () => {
      // After render, restore relative scroll position
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      });
    };
  }, [loadingOlder, eventIds.length]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
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
          <div className="text-center text-xs text-muted-foreground py-2">
            Beginning of session
          </div>
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
          ) : (
            <ReadGlobGroup
              key={node.items[0].id}
              items={node.items}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
