import { memo, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Code, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";
import { client } from "../../lib/urql";
import { DELETE_CHANNEL_MUTATION } from "../../lib/mutations";

function ChannelIcon({ type, className }: { type: string | undefined; className?: string }) {
  if (type === "text") return <MessageSquare size={16} className={className} />;
  return <Code size={16} className={className} />;
}

function ChannelContextMenu({
  x,
  y,
  channelId,
  onClose,
}: {
  x: number;
  y: number;
  channelId: string;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    client.mutation(DELETE_CHANNEL_MUTATION, { id: channelId }).toPromise();
    onClose();
  }, [confirming, channelId, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="absolute z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none hover:bg-destructive/10 text-destructive"
          onClick={handleDelete}
        >
          <Trash2 size={14} />
          {confirming ? "Confirm delete" : "Delete channel"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export const ChannelItem = memo(function ChannelItem({
  id,
  isActive,
  onClick,
  groupId,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
  groupId?: string | null;
}) {
  const name = useEntityField("channels", id, "name");
  const type = useEntityField("channels", id, "type");
  const hasDoneBadge = useUIStore((s) => !!s.channelDoneBadges[id]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const sortableData = useMemo(
    () => ({ type: "channel" as const, id, groupId: groupId ?? null }),
    [id, groupId],
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `channel:${id}`,
    data: sortableData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={handleContextMenu}
    >
      <SidebarMenuItem>
        <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={name ?? ""}>
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
      {contextMenu && (
        <ChannelContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          channelId={id}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
