import { useCallback, useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";

export type DesignPromptInput = {
  prompt: string;
};

type DesignPromptPopoverProps = {
  disabled?: boolean;
  title: string;
  actionLabel: string;
  defaultPrompt?: string;
  onSubmit: (input: DesignPromptInput) => Promise<void>;
};

export function buildDesignPromptInput(prompt: string): DesignPromptInput {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }
  return { prompt: trimmedPrompt };
}

export function DesignPromptPopover({
  disabled = false,
  title,
  actionLabel,
  defaultPrompt = "",
  onSubmit,
}: DesignPromptPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(defaultPrompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(defaultPrompt);
      setError(null);
    }
  }, [defaultPrompt, open]);

  const submit = useCallback(() => {
    let input: DesignPromptInput;
    try {
      input = buildDesignPromptInput(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setSaving(true);
    setError(null);
    void onSubmit(input)
      .then(() => setOpen(false))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [draft, onSubmit]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label={title}
        title={title}
      >
        <Wand2 size={14} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 gap-3 rounded-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-medium">{title}</div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="design-prompt">
            Prompt
          </label>
          <Textarea
            id="design-prompt"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            disabled={saving}
            className="min-h-32 resize-y text-sm"
          />
        </div>
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
            {actionLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
