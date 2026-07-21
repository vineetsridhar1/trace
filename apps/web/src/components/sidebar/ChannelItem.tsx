import { memo, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { ChevronRight, Mail, Plus, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { DeleteChannelDialog } from "../channel/DeleteChannelDialog";
import { cn } from "../../lib/utils";
import { createQuickSession } from "../../lib/create-quick-session";
import type { SidebarSessionScope } from "./ChannelOwnedSessions";

export const ChannelItem = memo(function ChannelItem({
  id,
  isActive,
  onClick,
  groupId,
  canExpand = false,
  canStartSession = false,
  onToggleSessionScope,
  isExpanded = false,
  sessionScope = "mine",
  onToggleExpanded,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
  groupId?: string | null;
  canExpand?: boolean;
  canStartSession?: boolean;
  onToggleSessionScope?: () => void;
  isExpanded?: boolean;
  sessionScope?: SidebarSessionScope;
  onToggleExpanded?: () => void;
}) {
  const name = useEntityField("channels", id, "name");
  const hasDoneBadge = useUIStore(
    (s: { channelDoneBadges: Record<string, boolean> }) => !!s.channelDoneBadges[id],
  );
  const markChannelDone = useUIStore((s) => s.markChannelDone);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const sortableData = useMemo(
    () => ({ type: "channel" as const, id, groupId: groupId ?? null }),
    [id, groupId],
  );

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `channel:${id}`,
    data: sortableData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="group/channel-item relative"
        {...attributes}
        {...listeners}
      >
        <ContextMenu>
          <ContextMenuTrigger render={<div />}>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isActive}
                onClick={onClick}
                tooltip={name ?? ""}
                className={cn(
                  "h-8 cursor-pointer gap-2 rounded-md bg-transparent px-0 pl-2 text-sm font-medium text-foreground",
                  canStartSession && "pr-16",
                  isActive && "bg-white/10 text-foreground",
                  "hover:!bg-white/10 hover:!text-foreground active:!bg-white/10 active:!text-foreground",
                  "data-active:!bg-white/10 data-active:font-medium data-active:!text-foreground",
                  "data-[active=true]:!bg-white/10 data-[active=true]:font-medium data-[active=true]:!text-foreground",
                )}
              >
                {canExpand && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-current opacity-60 transition-opacity hover:opacity-100"
                    title={isExpanded ? "Collapse channel sessions" : "Expand channel sessions"}
                    onClick={(event: MouseEvent<HTMLSpanElement>) => {
                      event.stopPropagation();
                      onToggleExpanded?.();
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      onToggleExpanded?.();
                    }}
                    onPointerDown={(event: PointerEvent<HTMLSpanElement>) =>
                      event.stopPropagation()
                    }
                  >
                    <ChevronRight
                      size={14}
                      className={
                        isExpanded ? "rotate-90 transition-transform" : "transition-transform"
                      }
                    />
                  </span>
                )}
                <span
                  className={cn(
                    "truncate text-indigo-300",
                    hasDoneBadge && "font-semibold",
                  )}
                >
                  {name}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => markChannelDone(id)}>
              <Mail size={14} className="mr-2" />
              Mark as unread
            </ContextMenuItem>
            {canStartSession && (
              <>
                <ContextMenuItem
                  onMouseDown={() => onToggleSessionScope?.()}
                >
                  <Users size={14} className="mr-2" />
                  {sessionScope === "mine" ? "Show all sessions" : "Show my sessions"}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} className="mr-2" />
              Delete channel
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {canStartSession && (
          <>
            <button
              type="button"
              className="pointer-events-none absolute right-8 top-1/2 z-20 flex h-5 w-9 -translate-y-1/2 cursor-pointer items-center justify-center overflow-hidden rounded px-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-foreground/55 opacity-0 transition-[opacity,color] group-hover/channel-item:pointer-events-auto group-hover/channel-item:opacity-100 group-focus-within/channel-item:pointer-events-auto group-focus-within/channel-item:opacity-100 hover:text-foreground"
              title="Toggle mine/all sessions"
              aria-label={`Sidebar sessions: ${sessionScope}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onContextMenuCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleSessionScope?.();
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.button === 0) {
                  onToggleSessionScope?.();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={sessionScope}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {sessionScope}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              type="button"
              className="absolute right-1 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground"
              title="New session"
              aria-label="New session"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                createQuickSession(id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Plus size={14} />
            </button>
          </>
        )}
        {hasDoneBadge && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1 z-30 flex h-2 w-2"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
        )}
      </div>

      <DeleteChannelDialog
        channelId={id}
        channelName={name ?? ""}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
});
