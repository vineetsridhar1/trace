import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { DmWelcome } from "./DmWelcome";

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
          {eventIds.map((id) => (
            <ChatMessage key={id} eventId={id} />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
