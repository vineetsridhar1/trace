import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { DmWelcome } from "./DmWelcome";
import { useEntityStore } from "../../stores/entity";

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

  // Auto-scroll to bottom when new messages arrive
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
          {eventIds.map((id, idx) => {
            let isGrouped = false;
            if (idx > 0) {
              const events = useEntityStore.getState().events;
              const prev = events[eventIds[idx - 1]];
              const curr = events[id];
              if (prev && curr) {
                const sameActor =
                  (prev.actor as { id?: string })?.id != null &&
                  (prev.actor as { id?: string })?.id === (curr.actor as { id?: string })?.id;
                const timeDiff =
                  new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
                // Also only group if neither is a thread reply
                const neitherIsReply = !prev.parentId && !curr.parentId;
                isGrouped = sameActor && timeDiff < GROUP_THRESHOLD_MS && neitherIsReply;
              }
            }
            return <ChatMessage key={id} eventId={id} isGrouped={isGrouped} />;
          })}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
