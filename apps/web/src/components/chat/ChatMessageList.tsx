import { useEffect, useMemo, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { DmWelcome } from "./DmWelcome";
import { useEntityStore } from "../../stores/entity";
import { useShallow } from "zustand/react/shallow";

/** Max gap in ms between messages from the same user to be grouped (5 min like Slack) */
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

export function ChatMessageList({
  chatId,
  eventIds,
  loading,
  hasOlder,
  onLoadOlder,
}: {
  chatId: string;
  eventIds: string[];
  loading: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Subscribe to only the events we need for grouping decisions
  const eventData = useEntityStore(
    useShallow((state) =>
      eventIds.map((id) => {
        const e = state.events[id];
        if (!e) return null;
        return {
          id,
          actorId: (e.actor as { id?: string })?.id ?? null,
          timestamp: e.timestamp,
          parentId: e.parentId,
        };
      }),
    ),
  );

  // Pre-compute grouping flags from subscribed event data
  const groupedFlags = useMemo(() => {
    const flags: boolean[] = new Array(eventData.length).fill(false);
    for (let i = 1; i < eventData.length; i++) {
      const prev = eventData[i - 1];
      const curr = eventData[i];
      if (!prev || !curr) continue;
      const sameActor = prev.actorId != null && prev.actorId === curr.actorId;
      const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
      const neitherIsReply = !prev.parentId && !curr.parentId;
      flags[i] = sameActor && timeDiff < GROUP_THRESHOLD_MS && neitherIsReply;
    }
    return flags;
  }, [eventData]);

  // Scroll to bottom instantly when entering a chat
  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView();
    }
    prevChatIdRef.current = chatId;
    wasAtBottomRef.current = true;
  }, [chatId, loading]);

  // Auto-scroll to bottom smoothly when new messages arrive
  useEffect(() => {
    if (wasAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [eventIds.length]);

  // Track scroll position
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    // Load older when near top
    if (el.scrollTop < 50 && hasOlder) {
      onLoadOlder();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {eventIds.length === 0 ? (
        <div className="flex h-full flex-col">
          <div className="flex-1" />
          <DmWelcome chatId={chatId} />
        </div>
      ) : (
        <div className="py-2">
          {!hasOlder && <DmWelcome chatId={chatId} />}
          {eventIds.map((id, idx) => (
            <ChatMessage key={id} eventId={id} isGrouped={groupedFlags[idx]} />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
