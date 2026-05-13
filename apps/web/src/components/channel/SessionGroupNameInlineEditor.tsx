import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, PointerEvent } from "react";
import { MAX_WORKSPACE_NAME_LENGTH } from "@trace/shared";
import { cn } from "@/lib/utils";

export function SessionGroupNameInlineEditor({
  className,
  initialName,
  onCancel,
  onSubmit,
}: {
  className?: string;
  initialName: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const stopRowEvent = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  const finish = (nextAction: "submit" | "cancel") => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    if (nextAction === "cancel") {
      onCancel();
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed || trimmed === initialName.trim()) {
      onCancel();
      return;
    }

    onSubmit(trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish("submit");
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish("cancel");
    }
  };

  return (
    <input
      ref={inputRef}
      aria-label="Workspace name"
      maxLength={MAX_WORKSPACE_NAME_LENGTH}
      value={draft}
      onBlur={() => finish("submit")}
      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onPointerDown={stopRowEvent}
      className={cn(
        "h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-elevated px-2 text-sm text-foreground outline-none focus:border-ring",
        className,
      )}
    />
  );
}
