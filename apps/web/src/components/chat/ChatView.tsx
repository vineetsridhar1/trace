import { useEffect, useRef, useState } from "react";
import { useUIStore } from "../../stores/ui";
import { useChatEvents } from "../../hooks/useChatEvents";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import { ThreadPanel } from "./ThreadPanel";

export function ChatView({ chatId }: { chatId: string }) {
  const activeThreadId = useUIStore((s) => s.activeThreadId);
  const { eventIds, loading, hasOlder, fetchOlderEvents } = useChatEvents(chatId);

  // Keep the last thread ID around so the panel stays rendered during close animation
  const lastThreadId = useRef(activeThreadId);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (activeThreadId) {
      lastThreadId.current = activeThreadId;
      setRendered(true);
    } else {
      // Wait for close animation to finish before unmounting
      const timer = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [activeThreadId]);

  const threadId = activeThreadId ?? lastThreadId.current;

  return (
    <div className="flex h-full flex-col">
      <ChatHeader chatId={chatId} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatMessageList
            chatId={chatId}
            eventIds={eventIds}
            loading={loading}
            hasOlder={hasOlder}
            onLoadOlder={fetchOlderEvents}
          />
          <ChatComposer chatId={chatId} />
        </div>
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: activeThreadId ? 320 : 0 }}
        >
          {rendered && threadId && (
            <ThreadPanel chatId={chatId} rootEventId={threadId} />
          )}
        </div>
      </div>
    </div>
  );
}
