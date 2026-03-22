import { useUIStore } from "../../stores/ui";
import { useChatMessages } from "../../hooks/useChatMessages";
import { useIsMobile } from "../../hooks/use-mobile";
import { useThreadPanelLayout } from "../../hooks/useThreadPanelLayout";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { DmWelcome } from "./DmWelcome";
import { ChatComposer } from "./ChatComposer";
import { ThreadPanel } from "./ThreadPanel";

const THREAD_WIDTH_KEY = "trace_thread_width";

export function ChatView({ chatId }: { chatId: string }) {
  const activeThreadId = useUIStore((s) => s.activeThreadId);
  const { messageIds, loading, hasOlder, fetchOlderMessages } = useChatMessages(chatId);
  const isMobile = useIsMobile();
  const { threadId, rendered, slideIn, threadWidth, isDragging, handleDragStart } =
    useThreadPanelLayout(activeThreadId, THREAD_WIDTH_KEY);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader chatId={chatId} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatMessageList
            scopeId={chatId}
            welcome={<DmWelcome chatId={chatId} />}
            messageIds={messageIds}
            loading={loading}
            hasOlder={hasOlder}
            onLoadOlder={fetchOlderMessages}
          />
          <ChatComposer chatId={chatId} />
        </div>

        {isMobile ? (
          /* Mobile: full-width overlay */
          rendered && threadId && (
            <div
              className="absolute inset-0 z-10 bg-background transition-transform duration-200 ease-in-out"
              style={{ transform: slideIn ? "translateX(0)" : "translateX(100%)" }}
            >
              <ThreadPanel chatId={chatId} rootMessageId={threadId} />
            </div>
          )
        ) : (
          /* Desktop: resizable side panel */
          <div
            className={`relative shrink-0 overflow-hidden ${isDragging ? "" : "transition-[width] duration-200 ease-in-out"}`}
            style={{ width: activeThreadId ? threadWidth : 0 }}
          >
            {rendered && threadId && (
              <>
                {/* Drag handle */}
                <div
                  onMouseDown={handleDragStart}
                  className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-ring active:bg-ring"
                />
                <ThreadPanel chatId={chatId} rootMessageId={threadId} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
