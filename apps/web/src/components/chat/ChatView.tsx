import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../stores/ui";
import { useChatMessages } from "../../hooks/useChatMessages";
import { useIsMobile } from "../../hooks/use-mobile";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import { ThreadPanel } from "./ThreadPanel";

const THREAD_WIDTH_KEY = "trace_thread_width";
const DEFAULT_THREAD_WIDTH = 320;
const MIN_THREAD_WIDTH = 260;
const MAX_THREAD_WIDTH = 600;

function getStoredWidth(): number {
  const stored = localStorage.getItem(THREAD_WIDTH_KEY);
  if (!stored) return DEFAULT_THREAD_WIDTH;
  const n = parseInt(stored, 10);
  return Number.isFinite(n) ? Math.min(MAX_THREAD_WIDTH, Math.max(MIN_THREAD_WIDTH, n)) : DEFAULT_THREAD_WIDTH;
}

export function ChatView({ chatId }: { chatId: string }) {
  const activeThreadId = useUIStore((s) => s.activeThreadId);
  const { messageIds, loading, hasOlder, fetchOlderMessages } = useChatMessages(chatId);
  const isMobile = useIsMobile();

  // Keep the last thread ID around so the panel stays rendered during close animation
  const lastThreadId = useRef(activeThreadId);
  const [rendered, setRendered] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const [threadWidth, setThreadWidth] = useState(getStoredWidth);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (activeThreadId) {
      lastThreadId.current = activeThreadId;
      setRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideIn(true));
      });
    } else {
      setSlideIn(false);
      const timer = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [activeThreadId]);

  // Drag resize handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = threadWidth;

    const onMouseMove = (ev: MouseEvent) => {
      // Dragging left = making panel wider (panel is on the right)
      const delta = startX - ev.clientX;
      const newWidth = Math.min(MAX_THREAD_WIDTH, Math.max(MIN_THREAD_WIDTH, startWidth + delta));
      setThreadWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      // Persist final width
      setThreadWidth((w) => {
        localStorage.setItem(THREAD_WIDTH_KEY, String(w));
        return w;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [threadWidth]);

  const threadId = activeThreadId ?? lastThreadId.current;

  return (
    <div className="flex h-full flex-col">
      <ChatHeader chatId={chatId} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatMessageList
            chatId={chatId}
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
