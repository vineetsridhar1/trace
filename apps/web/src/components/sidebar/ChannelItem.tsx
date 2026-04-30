import { memo, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { ChevronRight, MessageSquare, Code, Trash2 } from "lucide-react";
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

function ChannelIcon({ type, className }: { type: string | undefined; className?: string }) {
  if (type === "text") return <MessageSquare size={16} className={className} />;
  return <Code size={16} className={className} />;
}

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
  const type = useEntityField("channels", id, "type");
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
              <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={name ?? ""}>
                {canExpand && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
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
                      size={13}
                      className={
                        isExpanded ? "rotate-90 transition-transform" : "transition-transform"
                      }
                    />
                  </span>
                )}
                <div className="relative">
                  <ChannelIcon type={type} className="opacity-50" />
                  {hasDoneBadge && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-foreground" />
                    </span>
                  )}
                </div>
                <span className={hasDoneBadge ? "font-semibold" : undefined}>{name}</span>
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
