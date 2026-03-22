import { MessageSquare } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { useChannelMessages } from "../../hooks/useChannelMessages";
import { useIsMobile } from "../../hooks/use-mobile";
import { useThreadPanelLayout } from "../../hooks/useThreadPanelLayout";
import { ChatMessageList } from "../chat/ChatMessageList";
import { ChannelWelcome } from "./ChannelWelcome";
import { ChannelComposer } from "./ChannelComposer";
import { ThreadPanel } from "../chat/ThreadPanel";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";

const THREAD_WIDTH_KEY = "trace_channel_thread_width";

export function TextChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const activeThreadId = useUIStore((s) => s.activeThreadId);
  const { messageIds, loading, hasOlder, fetchOlderMessages } = useChannelMessages(channelId);
  const isMobile = useIsMobile();
  const { threadId, rendered, slideIn, threadWidth, isDragging, handleDragStart } =
    useThreadPanelLayout(activeThreadId, THREAD_WIDTH_KEY);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <MessageSquare size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {channelName ?? "Channel"}
        </h2>
        <ConnectionStatus />
      </div>

      {/* Messages + Thread */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatMessageList
            scopeId={channelId}
            welcome={<ChannelWelcome channelId={channelId} />}
            messageIds={messageIds}
            loading={loading}
            hasOlder={hasOlder}
            onLoadOlder={fetchOlderMessages}
          />
          <ChannelComposer channelId={channelId} />
        </div>

        {isMobile ? (
          rendered && threadId && (
            <div
              className="absolute inset-0 z-10 bg-background transition-transform duration-200 ease-in-out"
              style={{ transform: slideIn ? "translateX(0)" : "translateX(100%)" }}
            >
              <ThreadPanel channelId={channelId} rootMessageId={threadId} />
            </div>
          )
        ) : (
          <div
            className={`relative shrink-0 overflow-hidden ${isDragging ? "" : "transition-[width] duration-200 ease-in-out"}`}
            style={{ width: activeThreadId ? threadWidth : 0 }}
          >
            {rendered && threadId && (
              <>
                <div
                  onMouseDown={handleDragStart}
                  className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-ring active:bg-ring"
                />
                <ThreadPanel channelId={channelId} rootMessageId={threadId} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
