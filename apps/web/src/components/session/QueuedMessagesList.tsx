import { useCallback } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, GripVertical, X, Trash2 } from "lucide-react";
import type { QueuedMessage } from "@trace/gql";
import {
  REMOVE_QUEUED_MESSAGE_MUTATION,
  CLEAR_QUEUED_MESSAGES_MUTATION,
  REORDER_QUEUED_MESSAGES_MUTATION,
  StoreBatchWriter,
  useEntityField,
  useEntityStore,
  useQueuedMessageIdsForSession,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { toast } from "sonner";

function QueuedMessageItem({ id }: { id: string }) {
  const text = useEntityField("queuedMessages", id, "text") as string | undefined;
  const imageKeys = useEntityField("queuedMessages", id, "imageKeys") as string[] | undefined;
  const imageCount = imageKeys?.length ?? 0;
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : undefined,
  };

  const handleRemove = () => {
    client
      .mutation(REMOVE_QUEUED_MESSAGE_MUTATION, { id })
      .toPromise()
      .catch(() => toast.error("Failed to remove queued message"));
  };

  if (!text && imageCount === 0) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-md bg-surface-deep pr-3 py-1.5 text-sm text-muted-foreground"
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex shrink-0 cursor-grab touch-none items-center self-stretch px-2 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
        title="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
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

function patchQueuedMessagePositions(ids: string[]) {
  const queuedMessages = useEntityStore.getState().queuedMessages;
  const previous = ids.map((id) => ({
    id,
    position: queuedMessages[id]?.position,
  }));
  const batch = new StoreBatchWriter();
  ids.forEach((id, position) => {
    batch.patch("queuedMessages", id, { position } as Partial<QueuedMessage>);
  });
  batch.flush();

  return () => {
    const rollbackBatch = new StoreBatchWriter();
    previous.forEach(({ id, position }) => {
      if (position !== undefined) {
        rollbackBatch.patch("queuedMessages", id, { position } as Partial<QueuedMessage>);
      }
    });
    rollbackBatch.flush();
  };
}

export function QueuedMessagesList({ sessionId }: { sessionId: string }) {
  const ids = useQueuedMessageIdsForSession(sessionId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleClearAll = () => {
    client
      .mutation(CLEAR_QUEUED_MESSAGES_MUTATION, { sessionId })
      .toPromise()
      .catch(() => toast.error("Failed to clear queued messages"));
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const nextIds = arrayMove(ids, oldIndex, newIndex);
      const rollback = patchQueuedMessagePositions(nextIds);
      client
        .mutation(REORDER_QUEUED_MESSAGES_MUTATION, { sessionId, ids: nextIds })
        .toPromise()
        .then((result) => {
          if (result.error) {
            rollback();
            toast.error("Failed to reorder queued messages");
          }
        })
        .catch(() => {
          rollback();
          toast.error("Failed to reorder queued messages");
        });
    },
    [ids, sessionId],
  );

  if (ids.length === 0) return null;

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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {ids.map((id) => (
              <QueuedMessageItem key={id} id={id} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
