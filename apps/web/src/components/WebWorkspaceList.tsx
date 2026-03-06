import { memo, useCallback, useMemo, useState } from "react";
import { FiPlus, FiCircle } from "react-icons/fi";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import type { TicketStatus } from "../types";

const STATUS_DOT_COLOR: Record<TicketStatus, string> = {
  pending: "text-yellow-400",
  creation: "text-orange-400",
  in_progress: "text-green-400",
  completed: "text-gray-400",
  merged: "text-purple-400",
  needs_input: "text-amber-400",
  queued: "text-cyan-400",
  review: "text-teal-400",
  handed_off: "text-orange-300",
};

interface WebWorkspaceListProps {
  channelId: string;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
}

interface WorkspaceItemProps {
  id: string;
  status: TicketStatus;
  preview: string | null;
  ticketTitle: string | null;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const WorkspaceItem = memo(
  function WorkspaceItem({ id, status, preview, ticketTitle, isSelected, onSelect }: WorkspaceItemProps) {
    const dotColor = STATUS_DOT_COLOR[status] ?? STATUS_DOT_COLOR.pending;
    const displayText = ticketTitle || preview?.split("\n")[0] || "New Workspace";

    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? "bg-accent/20 text-primary"
            : "text-muted hover:bg-surface-elevated hover:text-primary"
        }`}
      >
        <FiCircle className={`h-2.5 w-2.5 shrink-0 fill-current ${dotColor}`} />
        <span className="truncate">{displayText}</span>
      </button>
    );
  },
  (prev, next) =>
    prev.status === next.status &&
    prev.preview === next.preview &&
    prev.ticketTitle === next.ticketTitle &&
    prev.isSelected === next.isSelected,
);

export function WebWorkspaceList({
  channelId,
  selectedWorkspaceId,
  onSelectWorkspace,
}: WebWorkspaceListProps) {
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const { createWorkspace } = useWorkspaceActions();

  const [showNewModal, setShowNewModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSelect = useCallback(
    (id: string) => onSelectWorkspace(id),
    [onSelectWorkspace],
  );

  const handleCreate = useCallback(async () => {
    const prompt = newPrompt.trim();
    if (!prompt || creating) return;
    setCreating(true);
    try {
      const { workspaceId } = await createWorkspace({ channelId, prompt });
      if (workspaceId) {
        setShowNewModal(false);
        setNewPrompt("");
        onSelectWorkspace(workspaceId);
      }
    } finally {
      setCreating(false);
    }
  }, [newPrompt, creating, createWorkspace, channelId, onSelectWorkspace]);

  const items = useMemo(
    () =>
      allWorkspaces
        .filter((w) => w.channelId === channelId)
        .map((w) => ({
          id: w.id,
          status: w.status,
          preview: w.preview,
          ticketTitle: w.ticketTitle,
        })),
    [allWorkspaces, channelId],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 className="text-sm font-medium text-primary">Workspaces</h2>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
        >
          <FiPlus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted">
            No workspaces yet
          </p>
        ) : (
          items.map((item) => (
            <WorkspaceItem
              key={item.id}
              id={item.id}
              status={item.status}
              preview={item.preview}
              ticketTitle={item.ticketTitle}
              isSelected={item.id === selectedWorkspaceId}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-96 mx-4 rounded-lg border border-edge bg-surface-elevated p-4 shadow-xl">
            <h3 className="text-sm font-medium text-primary">
              New Workspace
            </h3>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && newPrompt.trim() && !creating) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Describe what you'd like to work on..."
              className="mt-2 w-full rounded-md border border-edge bg-surface p-2 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
              rows={4}
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setShowNewModal(false);
                  setNewPrompt("");
                }}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newPrompt.trim() || creating}
                onClick={handleCreate}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
