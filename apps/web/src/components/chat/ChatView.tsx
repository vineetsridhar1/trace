import { useUIStore } from "../../stores/ui";
import { useChatEvents } from "../../hooks/useChatEvents";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import { ThreadPanel } from "./ThreadPanel";

export function ChatView({ chatId }: { chatId: string }) {
  const activeThreadId = useUIStore((s) => s.activeThreadId);
  const { eventIds, loading, hasOlder, fetchOlderEvents } = useChatEvents(chatId);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader chatId={chatId} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatMessageList
            eventIds={eventIds}
            loading={loading}
            hasOlder={hasOlder}
            onLoadOlder={fetchOlderEvents}
          />
          <ChatComposer chatId={chatId} />
        </div>
        {activeThreadId && (
          <ThreadPanel chatId={chatId} rootEventId={activeThreadId} />
        )}
      </div>
    </div>
  );
}
