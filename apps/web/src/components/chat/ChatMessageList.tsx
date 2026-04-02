import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatMessageErrorBoundary } from "./ChatMessageErrorBoundary";
import { useEntityStore, type EntityState } from "../../stores/entity";
import { useShallow } from "zustand/react/shallow";
import { Loader2 } from "lucide-react";

/** Max gap in ms between messages from the same user to be grouped (5 min like Slack) */
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

export function ChatMessageList({
  scopeId,
  welcome,
  messageIds,
  loading,
  hasOlder,
  onLoadOlder,
}: {
  scopeId: string;
  welcome?: React.ReactNode;
  messageIds: string[];
  loading: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Subscribe to only the messages we need for grouping decisions.
  const messages = useEntityStore(
    useShallow((state: EntityState) =>
      messageIds.map((id: string) => state.messages[id] ?? null),
    ),
  );

  // Group consecutive top-level messages from the same actor when they are
  // close together in time.
  const groupedFlags = useMemo(() => {
    const flags: boolean[] = new Array(messages.length).fill(false);
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (!prev || !curr) continue;
      const prevActorId = (prev.actor as { id?: string })?.id ?? null;
      const currActorId = (curr.actor as { id?: string })?.id ?? null;
      const sameActor = prevActorId != null && prevActorId === currActorId;
      const timeDiff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
      const neitherIsReply = !prev.parentMessageId && !curr.parentMessageId;
      flags[i] = sameActor && timeDiff < GROUP_THRESHOLD_MS && neitherIsReply;
    }
    return flags;
  }, [messages]);

  // Scroll to bottom instantly when entering a chat
  const prevScopeIdRef = useRef(scopeId);
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView();
    }
    prevScopeIdRef.current = scopeId;
    wasAtBottomRef.current = true;
  }, [scopeId, loading]);

  // Auto-scroll to bottom smoothly when new messages arrive
  useEffect(() => {
    if (wasAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageIds.length]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    // Load older when near top
    if (el.scrollTop < 50 && hasOlder) {
      onLoadOlder();
    }
  }, [hasOlder, onLoadOlder]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Fetching messages…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {messageIds.length === 0 ? (
        <div className="flex h-full flex-col">
          <div className="flex-1" />
          {welcome}
        </div>
      ) : (
        <div className="py-2">
          {!hasOlder ? welcome : null}
          {messageIds.map((id, idx) => (
            <ChatMessageErrorBoundary key={id}>
              <ChatMessage messageId={id} isGrouped={groupedFlags[idx]} />
            </ChatMessageErrorBoundary>
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
