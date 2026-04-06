import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLabelBranch } from "../hooks/useAiConversationMutations";

interface EditableBranchLabelProps {
  branchId: string;
  label: string;
  className?: string;
}

/**
 * Inline-editable branch label component.
 * Double-click to enter edit mode. Enter to save, Escape to cancel.
 * Auto-selects all text on focus. Used by tree panel and breadcrumb.
 */
export function EditableBranchLabel({ branchId, label, className }: EditableBranchLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelBranch = useLabelBranch();

  // Sync draft when label changes externally (e.g. from event stream)
  useEffect(() => {
    if (!editing) {
      setDraft(label);
    }
  }, [label, editing]);

  const startEditing = useCallback(() => {
    setDraft(label);
    setEditing(true);
  }, [label]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);

    if (trimmed && trimmed !== label) {
      labelBranch({ branchId, label: trimmed });
    }
  }, [draft, label, branchId, labelBranch]);

  const cancel = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  // Auto-select all text when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cn(
          "h-6 min-w-0 rounded border border-input bg-transparent px-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
          className,
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={startEditing}
      className={cn("cursor-default truncate text-sm", className)}
      title="Double-click to rename"
    >
      {label}
    </span>
  );
}
