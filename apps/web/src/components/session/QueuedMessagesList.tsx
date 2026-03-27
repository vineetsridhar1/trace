import { useCallback, useState } from "react";
import { GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { client } from "../../lib/urql";
import {
  UPDATE_QUEUED_MESSAGE_MUTATION,
  REMOVE_QUEUED_MESSAGE_MUTATION,
  REORDER_QUEUED_MESSAGES_MUTATION,
} from "../../lib/mutations";
import type { QueuedMessage } from "@trace/gql";
import { cn } from "../../lib/utils";

function QueuedMessageItem({
  id,
  position,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  id: string;
  position: number;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (id: string) => void;
}) {
  const text = useEntityField("queuedMessages", id, "text") as string | undefined;
  const interactionMode = useEntityField("queuedMessages", id, "interactionMode") as
    | string
    | null
    | undefined;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const handleEdit = useCallback(() => {
    setEditText(text ?? "");
    setEditing(true);
  }, [text]);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditing(false);
    // Optimistic update
    useEntityStore.getState().patch("queuedMessages", id, { text: trimmed } as Partial<QueuedMessage>);
    await client
      .mutation(UPDATE_QUEUED_MESSAGE_MUTATION, { id, text: trimmed })
      .toPromise();
  }, [id, editText]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleRemove = useCallback(async () => {
    // Optimistic remove
    useEntityStore.getState().remove("queuedMessages", id);
    await client.mutation(REMOVE_QUEUED_MESSAGE_MUTATION, { id }).toPromise();
  }, [id]);

  if (!text) return null;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(id)}
      className="group flex items-center gap-2 rounded-md border border-border/50 bg-surface-deep px-2 py-1.5 text-sm"
    >
      <GripVertical
        size={14}
        className="shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
      />
      <span className="shrink-0 text-xs text-muted-foreground">{position + 1}.</span>

      {editing ? (
        <div className="flex flex-1 items-center gap-1">
          <input
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEdit();
              if (e.key === "Escape") handleCancelEdit();
            }}
            autoFocus
            className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button onClick={handleSaveEdit} className="cursor-pointer text-green-400 hover:text-green-300">
            <Check size={14} />
          </button>
          <button onClick={handleCancelEdit} className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate text-foreground/80">{text}</span>
          {interactionMode && interactionMode !== "code" && (
            <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {interactionMode}
            </span>
          )}
          <button
            onClick={handleEdit}
            className="shrink-0 cursor-pointer text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-foreground"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={handleRemove}
            className="shrink-0 cursor-pointer text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-destructive"
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}

export function QueuedMessagesList({
  sessionId,
  queuedMessageIds,
}: {
  sessionId: string;
  queuedMessageIds: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    setDragId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) return;
      const ids = [...queuedMessageIds];
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragId);

      // Optimistic reorder — update positions in store immediately
      const { patch } = useEntityStore.getState();
      for (let i = 0; i < ids.length; i++) {
        patch("queuedMessages", ids[i], { position: i } as Partial<QueuedMessage>);
      }

      client
        .mutation(REORDER_QUEUED_MESSAGES_MUTATION, { sessionId, orderedIds: ids })
        .toPromise();
      setDragId(null);
    },
    [dragId, queuedMessageIds, sessionId],
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
  }, []);

  return (
    <div className="mt-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className={cn("transition-transform", collapsed ? "-rotate-90" : "")}>▾</span>
        <span>
          {queuedMessageIds.length} queued message{queuedMessageIds.length !== 1 ? "s" : ""}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-1 flex flex-col gap-1" onDragEnd={handleDragEnd}>
          {queuedMessageIds.map((id, i) => (
            <QueuedMessageItem
              key={id}
              id={id}
              position={i}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}
