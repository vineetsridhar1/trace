import { memo, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { DeleteChannelDialog } from "../channel/DeleteChannelDialog";
import { cn } from "../../lib/utils";

export const ChannelItem = memo(function ChannelItem({
  id,
  isActive,
  onClick,
  groupId,
  canExpand = false,
  isExpanded = false,
  onToggleExpanded,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
  groupId?: string | null;
  canExpand?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const name = useEntityField("channels", id, "name");
  const hasDoneBadge = useUIStore(
    (s: { channelDoneBadges: Record<string, boolean> }) => !!s.channelDoneBadges[id],
  );
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
      <ContextMenu>
        <ContextMenuTrigger>
          <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isActive}
                onClick={onClick}
                tooltip={name ?? ""}
                className={cn(
                  "h-8 cursor-pointer gap-2 rounded-md bg-transparent px-0 pl-2 text-sm font-medium text-foreground",
                  isActive ? "bg-white/10" : "hover:bg-white/10",
                  "data-[active=true]:bg-white/10 data-[active=true]:font-medium data-[active=true]:text-foreground",
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
                <span className={hasDoneBadge ? "truncate font-semibold" : "truncate"}>
                  {name}
                </span>
                {hasDoneBadge && (
                  <span className="relative ml-auto flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-foreground opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-foreground" />
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} className="mr-2" />
            Delete channel
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <DeleteChannelDialog
        channelId={id}
        channelName={name ?? ""}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
});
