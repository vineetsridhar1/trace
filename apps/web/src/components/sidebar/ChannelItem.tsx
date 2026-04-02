import { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Code, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";
import { client } from "../../lib/urql";
import { DELETE_CHANNEL_MUTATION } from "../../lib/mutations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";

function ChannelIcon({ type, className }: { type: string | undefined; className?: string }) {
  if (type === "text") return <MessageSquare size={16} className={className} />;
  return <Code size={16} className={className} />;
}

function ChannelContextMenu({
  x,
  y,
  onClose,
  onDelete,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}) {
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
        className="absolute z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none hover:bg-destructive/10 text-destructive"
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          <Trash2 size={14} />
          Delete channel
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    client.mutation(DELETE_CHANNEL_MUTATION, { id }).toPromise();
    setShowDeleteDialog(false);
  }, [id]);

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
          onClose={() => setContextMenu(null)}
          onDelete={() => setShowDeleteDialog(true)}
        />
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete channel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{name}</strong>? This will permanently delete
              all sessions and session groups in this channel. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
