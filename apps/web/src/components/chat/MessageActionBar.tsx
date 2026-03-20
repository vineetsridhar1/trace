import { MessageSquare, Pencil, Trash2 } from "lucide-react";

export function MessageActionBar({
  canManage,
  onThread,
  onEdit,
  onDelete,
}: {
  canManage: boolean;
  onThread: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-surface-elevated shadow-sm md:group-hover:inline-flex">
      <button
        onClick={onThread}
        className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Reply in thread"
      >
        <MessageSquare size={15} />
      </button>
      {canManage && (
        <>
          <button
            onClick={onEdit}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit message"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Delete message"
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
}
