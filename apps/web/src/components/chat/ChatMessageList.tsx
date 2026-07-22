import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntityStore, type EntityState } from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";
import { ChatMessage } from "./ChatMessage";
import { ChatMessageErrorBoundary } from "./ChatMessageErrorBoundary";
import { TraceLoader } from "../ui/trace-loader";

const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

type VirtualRow =
  | { kind: "welcome"; key: string }
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; messageId: string; grouped: boolean };

function dayKey(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(timestamp: string) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(timestamp) === dayKey(today.toISOString())) return "Today";
  if (dayKey(timestamp) === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function ChatMessageList({
  scopeId,
  welcome,
  messageIds,
  loading,
  hasOlder,
  onLoadOlder,
  onBottomMessageVisible,
}: {
  scopeId: string;
  welcome?: React.ReactNode;
  messageIds: string[];
  loading: boolean;
  hasOlder: boolean;
  onLoadOlder: () => Promise<void>;
  onBottomMessageVisible?: (messageId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const messages = useEntityStore(
    useShallow((state: EntityState) => messageIds.map((id) => state.messages[id] ?? null)),
  );

  const rows = useMemo(() => {
    const result: VirtualRow[] = [];
    if (!hasOlder && welcome) result.push({ kind: "welcome", key: "welcome" });
    let previousDay: string | null = null;
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (!message) continue;
      const currentDay = dayKey(message.createdAt);
      if (currentDay !== previousDay) {
        result.push({ kind: "date", key: `date:${currentDay}`, label: dayLabel(message.createdAt) });
        previousDay = currentDay;
      }
      const previous = index > 0 ? messages[index - 1] : null;
      const grouped = !!(
        previous &&
        dayKey(previous.createdAt) === currentDay &&
        previous.actor.id === message.actor.id &&
        new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
          GROUP_THRESHOLD_MS &&
        !previous.parentMessageId &&
        !message.parentMessageId
      );
      result.push({ kind: "message", key: message.id, messageId: message.id, grouped });
    }
    return result;
  }, [hasOlder, messages, welcome]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.kind === "welcome") return 150;
      if (row?.kind === "date") return 38;
      return 60;
    },
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? index,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const reportBottom = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    wasAtBottomRef.current = atBottom;
    if (atBottom) {
      const latestMessageId = messageIds.at(-1);
      if (latestMessageId) onBottomMessageVisible?.(latestMessageId);
    }
  }, [messageIds, onBottomMessageVisible]);

  const loadOlder = useCallback(async () => {
    const element = containerRef.current;
    if (!element || loadingOlderRef.current || !hasOlder) return;
    loadingOlderRef.current = true;
    const previousHeight = virtualizer.getTotalSize();
    const previousTop = element.scrollTop;
    await onLoadOlder();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nextHeight = virtualizer.getTotalSize();
        element.scrollTop = previousTop + Math.max(0, nextHeight - previousHeight);
        loadingOlderRef.current = false;
      });
    });
  }, [hasOlder, onLoadOlder, virtualizer]);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    reportBottom();
    if (element.scrollTop < 80) void loadOlder();
  }, [loadOlder, reportBottom]);

  useEffect(() => {
    if (loading || rows.length === 0) return;
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
      requestAnimationFrame(reportBottom);
    });
  }, [loading, scopeId]);

  const previousMessageCountRef = useRef(messageIds.length);
  useEffect(() => {
    const grew = messageIds.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messageIds.length;
    if (!grew || !wasAtBottomRef.current || rows.length === 0) return;
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
      requestAnimationFrame(reportBottom);
    });
  }, [messageIds.length, reportBottom, rows.length, virtualizer]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <TraceLoader size={24} showLabel={false} />
          <span className="text-sm">Fetching messages…</span>
        </div>
      </div>
    );
  }

  if (messageIds.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex-1" />
        {welcome}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="chat-message-list"
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === "welcome" ? (
                welcome
              ) : row.kind === "date" ? (
                <div className="flex items-center gap-3 px-4 py-3" role="separator">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              ) : (
                <ChatMessageErrorBoundary>
                  <ChatMessage messageId={row.messageId} isGrouped={row.grouped} />
                </ChatMessageErrorBoundary>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
