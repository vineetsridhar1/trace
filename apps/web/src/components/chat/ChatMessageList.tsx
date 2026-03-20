import { useEffect, useRef } from "react";
import { useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import type { Event } from "@trace/gql";

function ChatMessage({ eventId }: { eventId: string }) {
  const event = useEntityStore((s) => s.events[eventId]) as Event | undefined;
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);

  if (!event) return null;

  const text = typeof event.payload.text === "string" ? event.payload.text : "";
  const actorName = event.actor?.name ?? "Unknown";
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-surface-elevated/30">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {actorName[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{actorName}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
        <button
          onClick={() => setActiveThreadId(event.id)}
          className="mt-0.5 hidden text-xs text-muted-foreground hover:text-foreground group-hover:inline-flex"
        >
          Reply in thread
        </button>
      </div>
    </div>
  );
}

export function ChatMessageList({
  eventIds,
  loading,
  hasOlder,
  onLoadOlder,
}: {
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
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
        </div>
      ) : (
        <div className="py-2">
          {eventIds.map((id) => (
            <ChatMessage key={id} eventId={id} />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
