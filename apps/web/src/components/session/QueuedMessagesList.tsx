import { FileText, X, Trash2 } from "lucide-react";
import { useEntityField, useQueuedMessageIdsForSession } from "@trace/client-core";
import { client } from "../../lib/urql";
import { REMOVE_QUEUED_MESSAGE_MUTATION, CLEAR_QUEUED_MESSAGES_MUTATION } from "@trace/client-core";
import { toast } from "sonner";

function QueuedMessageItem({ id }: { id: string }) {
  const text = useEntityField("queuedMessages", id, "text") as string | undefined;
  const imageKeys = useEntityField("queuedMessages", id, "imageKeys") as string[] | undefined;
  const imageCount = imageKeys?.length ?? 0;

  const handleRemove = () => {
    client
      .mutation(REMOVE_QUEUED_MESSAGE_MUTATION, { id })
      .toPromise()
      .catch(() => toast.error("Failed to remove queued message"));
  };

  if (!text && imageCount === 0) return null;

  return (
    <div className="group flex items-center gap-2 rounded-md bg-surface-deep px-3 py-1.5 text-sm text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{text || "File attachment"}</span>
      {imageCount > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <FileText size={12} />
          {imageCount}
        </span>
      )}
      <button
        onClick={handleRemove}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        title="Remove"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function QueuedMessagesList({ sessionId }: { sessionId: string }) {
  const ids = useQueuedMessageIdsForSession(sessionId);

  if (ids.length === 0) return null;

  const handleClearAll = () => {
    client
      .mutation(CLEAR_QUEUED_MESSAGES_MUTATION, { sessionId })
      .toPromise()
      .catch(() => toast.error("Failed to clear queued messages"));
  };

  return (
    <div className="flex flex-col gap-1 px-4 pb-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Queued ({ids.length})</span>
        {ids.length > 1 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 size={12} />
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {ids.map((id) => (
          <QueuedMessageItem key={id} id={id} />
        ))}
      </div>
    </div>
  );
}
