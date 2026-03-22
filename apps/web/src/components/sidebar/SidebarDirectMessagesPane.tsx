import { ChatItem } from "./ChatItem";
import { CreateChatDialog } from "./CreateChatDialog";
import { Skeleton } from "../ui/skeleton";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";
import { type SidebarPaneVariant } from "./sidebarTabs";

export interface SidebarDirectMessagesPaneProps {
  activeChatId: string | null;
  chatIds: string[];
  chatsLoading: boolean;
  onChatClick: (id: string) => void;
  variant?: SidebarPaneVariant;
}

export function SidebarDirectMessagesPane({
  activeChatId,
  chatIds,
  chatsLoading,
  onChatClick,
  variant = "expanded",
}: SidebarDirectMessagesPaneProps) {
  const bodyClassName = variant === "overlay" ? "px-2 py-2" : "pt-3";

  return (
    <section className="flex h-full min-w-full shrink-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <p className="truncate text-sm font-semibold text-sidebar-foreground">Direct Messages</p>
        <CreateChatDialog />
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
        <SidebarMenu>
          {chatsLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <SidebarMenuItem key={index}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="h-4 w-4 shrink-0 rounded" />
                  <Skeleton className="h-3.5 w-[55%]" />
                </div>
              </SidebarMenuItem>
            ))
          ) : (
            chatIds.map((id) => (
              <ChatItem
                key={id}
                id={id}
                isActive={id === activeChatId}
                onClick={() => onChatClick(id)}
              />
            ))
          )}
        </SidebarMenu>

        {!chatsLoading && chatIds.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No conversations yet</p>
        )}
      </div>
    </section>
  );
}

