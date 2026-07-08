import { useCallback, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileText, GripVertical, Pencil, Send, X, Trash2 } from "lucide-react";
import type { QueuedMessage } from "@trace/gql";
import {
  REMOVE_QUEUED_MESSAGE_MUTATION,
  CLEAR_QUEUED_MESSAGES_MUTATION,
  REORDER_QUEUED_MESSAGES_MUTATION,
  STEER_QUEUED_MESSAGE_MUTATION,
  UPDATE_QUEUED_MESSAGE_MUTATION,
  StoreBatchWriter,
  dropStaleQueuedMessage,
  isMissingQueuedMessageError,
  useEntityField,
  useEntityStore,
  useQueuedMessageIdsForSession,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { toast } from "sonner";
import { stripPromptWrapping, wrapPrompt, type InteractionMode } from "./interactionModes";

function QueuedMessageItem({ id, sessionId }: { id: string; sessionId: string }) {
  const text = useEntityField("queuedMessages", id, "text") as string | undefined;
  const imageKeys = useEntityField("queuedMessages", id, "imageKeys") as string[] | undefined;
  const interactionMode = useEntityField("queuedMessages", id, "interactionMode") as
    | string
    | null
    | undefined;
  const imageCount = imageKeys?.length ?? 0;
  const displayText = stripPromptWrapping(text ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(displayText);
  const [isBusy, setIsBusy] = useState(false);
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
      .then((result) => {
        if (isMissingQueuedMessageError(result.error)) {
          dropStaleQueuedMessage(sessionId, id);
        } else if (result.error) {
          toast.error("Failed to remove queued message");
        }
      })
      .catch(() => toast.error("Failed to remove queued message"));
  };

  const handleStartEdit = () => {
    setEditText(displayText);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditText(displayText);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    const nextText = editText.trim();
    if ((!nextText && imageCount === 0) || nextText === displayText) {
      setIsEditing(false);
      return;
    }
    const nextStoredText =
      nextText && (interactionMode === "plan" || interactionMode === "ask")
        ? wrapPrompt(interactionMode as InteractionMode, nextText)
        : nextText;

    setIsBusy(true);
    client
      .mutation(UPDATE_QUEUED_MESSAGE_MUTATION, { id, text: nextStoredText })
      .toPromise()
      .then((result) => {
        if (isMissingQueuedMessageError(result.error)) {
          dropStaleQueuedMessage(sessionId, id);
          setIsEditing(false);
          return;
        }
        if (result.error) {
          toast.error("Failed to edit queued message");
          return;
        }
        setIsEditing(false);
      })
      .catch(() => toast.error("Failed to edit queued message"))
      .finally(() => setIsBusy(false));
  };

  const handleSteer = () => {
    setIsBusy(true);
    client
      .mutation(STEER_QUEUED_MESSAGE_MUTATION, { id })
      .toPromise()
      .then((result) => {
        if (isMissingQueuedMessageError(result.error)) {
          dropStaleQueuedMessage(sessionId, id);
        } else if (result.error) {
          toast.error("Failed to steer queued message");
        }
      })
      .catch(() => toast.error("Failed to steer queued message"))
      .finally(() => setIsBusy(false));
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
      {isEditing ? (
        <input
          value={editText}
          onChange={(event) => setEditText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSaveEdit();
            if (event.key === "Escape") handleCancelEdit();
          }}
          disabled={isBusy}
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary"
          autoFocus
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{displayText || "File attachment"}</span>
      )}
      {imageCount > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <FileText size={12} />
          {imageCount}
        </span>
      )}
      {isEditing ? (
        <>
          <button
            onClick={handleSaveEdit}
            disabled={isBusy}
            className="shrink-0 transition-colors hover:text-foreground disabled:opacity-50"
            title="Save"
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleCancelEdit}
            disabled={isBusy}
            className="shrink-0 transition-colors hover:text-foreground disabled:opacity-50"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleSteer}
            disabled={isBusy}
            className="flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium transition-colors hover:text-foreground hover:bg-surface-elevated disabled:opacity-50"
            title="Steer with this prompt"
          >
            <Send size={12} />
            Steer
          </button>
          <button
            onClick={handleStartEdit}
            disabled={isBusy}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground disabled:opacity-50"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleRemove}
            disabled={isBusy}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground disabled:opacity-50"
            title="Remove"
          >
            <X size={14} />
          </button>
        </>
      )}
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
  const reorderRequestIdRef = useRef(0);

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
      const requestId = reorderRequestIdRef.current + 1;
      reorderRequestIdRef.current = requestId;
      const rollback = patchQueuedMessagePositions(nextIds);
      const rollbackIfCurrent = () => {
        if (reorderRequestIdRef.current === requestId) {
          rollback();
        }
      };
      client
        .mutation(REORDER_QUEUED_MESSAGES_MUTATION, { sessionId, ids: nextIds })
        .toPromise()
        .then((result) => {
          if (result.error) {
            rollbackIfCurrent();
            toast.error("Failed to reorder queued messages");
          }
        })
        .catch(() => {
          rollbackIfCurrent();
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
              <QueuedMessageItem key={id} id={id} sessionId={sessionId} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
