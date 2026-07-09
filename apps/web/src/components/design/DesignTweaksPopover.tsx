import { useCallback, useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";

type DesignTweaksPopoverProps = {
  disabled?: boolean;
  onApply: (tokens: Record<string, string>) => Promise<void>;
  triggerClassName?: string;
};

export function buildDesignTokenPatch(name: string, value: string): Record<string, string> {
  const trimmedName = name.trim();
  const trimmedValue = value.trim();
  if (!/^--[a-zA-Z0-9-_]+$/.test(trimmedName)) {
    throw new Error("Token name must be a CSS variable like --trace-accent.");
  }
  if (!trimmedValue) {
    throw new Error("Token value is required.");
  }
  return { [trimmedName]: trimmedValue };
}

export function DesignTweaksPopover({
  disabled = false,
  onApply,
  triggerClassName,
}: DesignTweaksPopoverProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("--trace-accent");
  const [value, setValue] = useState("#0f766e");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  const apply = useCallback(() => {
    let tokens: Record<string, string>;
    try {
      tokens = buildDesignTokenPatch(name, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setSaving(true);
    setError(null);
    void onApply(tokens)
      .then(() => setOpen(false))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [name, onApply, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40",
          triggerClassName,
        )}
        aria-label="Tweak tokens"
        title="Tweak tokens"
      >
        <SlidersHorizontal size={14} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 gap-3 rounded-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div>
          <div className="text-sm font-medium">Tweak tokens</div>
          <div className="text-xs text-muted-foreground">
            Patch CSS variables without a model run.
          </div>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="design-token-name">
            Variable
          </label>
          <Input
            id="design-token-name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={saving}
            placeholder="--trace-accent"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="design-token-value">
            Value
          </label>
          <Input
            id="design-token-value"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            disabled={saving}
            placeholder="#0f766e"
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
