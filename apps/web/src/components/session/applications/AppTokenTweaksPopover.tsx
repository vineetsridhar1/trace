import { useCallback, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

type AppTokenTweaksPopoverProps = {
  disabled?: boolean;
  onApply: (rawJson: string) => Promise<void>;
};

export function defaultAppTokenPatchJson(): string {
  return JSON.stringify({ color: { primary: "#ef4444" } }, null, 2);
}

export function AppTokenTweaksPopover({ disabled = false, onApply }: AppTokenTweaksPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(defaultAppTokenPatchJson);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(() => {
    if (!draft.trim()) {
      setError("Token patch JSON is required.");
      return;
    }

    setSaving(true);
    setError(null);
    void onApply(draft)
      .then(() => setOpen(false))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [draft, onApply]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        title="Tweak app tokens"
        aria-label="Tweak app tokens"
      >
        <SlidersHorizontal size={14} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 rounded-md">
        <div>
          <div className="text-sm font-medium">Tweak app tokens</div>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="app-token-json">
            JSON patch
          </label>
          <textarea
            id="app-token-json"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            disabled={saving}
            spellCheck={false}
            className="min-h-32 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 font-mono text-xs leading-5 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
            onClick={apply}
            disabled={saving}
            className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
