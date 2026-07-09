import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";

export type DesignCommentInput = {
  body: string;
  sendToAgent: boolean;
};

type DesignCommentPopoverProps = {
  disabled?: boolean;
  hasAnchor?: boolean;
  onSubmit: (comment: DesignCommentInput) => Promise<void>;
};

export function buildDesignCommentInput(body: string, sendToAgent: boolean): DesignCommentInput {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new Error("Comment body is required.");
  }
  return { body: trimmedBody, sendToAgent };
}

export function DesignCommentPopover({
  disabled = false,
  hasAnchor = false,
  onSubmit,
}: DesignCommentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sendToAgent, setSendToAgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  const submit = useCallback(() => {
    let comment: DesignCommentInput;
    try {
      comment = buildDesignCommentInput(body, sendToAgent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setSaving(true);
    setError(null);
    void onSubmit(comment)
      .then(() => {
        setBody("");
        setSendToAgent(false);
        setOpen(false);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [body, onSubmit, sendToAgent]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Comment"
        title="Comment"
      >
        <MessageSquare size={14} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-3 rounded-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Comment</div>
          {hasAnchor ? (
            <div className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Anchored
            </div>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="design-comment">
            Body
          </label>
          <Textarea
            id="design-comment"
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            disabled={saving}
            className="min-h-24 resize-y text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={sendToAgent}
            onChange={(event) => setSendToAgent(event.currentTarget.checked)}
            disabled={saving}
            className="size-3.5 rounded border-input"
          />
          Send to agent
        </label>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 items-center rounded-md px-2.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
