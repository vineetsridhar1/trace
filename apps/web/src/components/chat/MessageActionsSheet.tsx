import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "../ui/sheet";

interface MessageActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplyInThread: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageActionsSheet({
  open,
  onOpenChange,
  onReplyInThread,
  onEdit,
  onDelete,
}: MessageActionsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-xl px-0 pb-[env(safe-area-inset-bottom)]">
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex flex-col">
          <button
            onClick={() => {
              onOpenChange(false);
              onReplyInThread();
            }}
            className="flex items-center gap-3 px-5 py-3 text-left text-sm text-foreground active:bg-muted"
          >
            <MessageSquare size={18} className="text-muted-foreground" />
            Reply in thread
          </button>
          <button
            onClick={() => {
              onOpenChange(false);
              onEdit();
            }}
            className="flex items-center gap-3 px-5 py-3 text-left text-sm text-foreground active:bg-muted"
          >
            <Pencil size={18} className="text-muted-foreground" />
            Edit message
          </button>
          <div className="mx-4 border-t border-border" />
          <button
            onClick={() => {
              onOpenChange(false);
              onDelete();
            }}
            className="flex items-center gap-3 px-5 py-3 text-left text-sm text-red-400 active:bg-red-500/10"
          >
            <Trash2 size={18} />
            Delete message
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
