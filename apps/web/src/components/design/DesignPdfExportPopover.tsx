import { useCallback, useEffect, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export type DesignPdfPageOptions = {
  widthPx?: number;
  heightPx?: number;
  marginTopPx?: number;
  marginRightPx?: number;
  marginBottomPx?: number;
  marginLeftPx?: number;
};

type DesignPdfExportDraft = Record<keyof DesignPdfPageOptions, string>;

type DesignPdfExportPopoverProps = {
  disabled?: boolean;
  onExport: (pageOptions: DesignPdfPageOptions | null) => Promise<void>;
};

const EMPTY_DRAFT: DesignPdfExportDraft = {
  widthPx: "",
  heightPx: "",
  marginTopPx: "",
  marginRightPx: "",
  marginBottomPx: "",
  marginLeftPx: "",
};

const PRESET_DECK_DRAFT: DesignPdfExportDraft = {
  widthPx: "1440",
  heightPx: "1080",
  marginTopPx: "0",
  marginRightPx: "0",
  marginBottomPx: "0",
  marginLeftPx: "0",
};

function parseOptionalInteger(label: string, value: string, min: number, max: number) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

export function buildDesignPdfPageOptions(
  draft: DesignPdfExportDraft,
): DesignPdfPageOptions | null {
  const widthPx = parseOptionalInteger("Width", draft.widthPx, 100, 10000);
  const heightPx = parseOptionalInteger("Height", draft.heightPx, 100, 10000);
  if ((widthPx == null) !== (heightPx == null)) {
    throw new Error("Width and height must be provided together.");
  }

  const options: DesignPdfPageOptions = {};
  if (widthPx != null && heightPx != null) {
    options.widthPx = widthPx;
    options.heightPx = heightPx;
  }

  const marginTopPx = parseOptionalInteger("Top margin", draft.marginTopPx, 0, 1000);
  const marginRightPx = parseOptionalInteger("Right margin", draft.marginRightPx, 0, 1000);
  const marginBottomPx = parseOptionalInteger("Bottom margin", draft.marginBottomPx, 0, 1000);
  const marginLeftPx = parseOptionalInteger("Left margin", draft.marginLeftPx, 0, 1000);
  if (marginTopPx != null) options.marginTopPx = marginTopPx;
  if (marginRightPx != null) options.marginRightPx = marginRightPx;
  if (marginBottomPx != null) options.marginBottomPx = marginBottomPx;
  if (marginLeftPx != null) options.marginLeftPx = marginLeftPx;

  return Object.keys(options).length > 0 ? options : null;
}

export function DesignPdfExportPopover({
  disabled = false,
  onExport,
}: DesignPdfExportPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DesignPdfExportDraft>(PRESET_DECK_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  const updateDraft = useCallback((key: keyof DesignPdfPageOptions, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const apply = useCallback(() => {
    let pageOptions: DesignPdfPageOptions | null;
    try {
      pageOptions = buildDesignPdfPageOptions(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setSaving(true);
    setError(null);
    void onExport(pageOptions)
      .then(() => setOpen(false))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [draft, onExport]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Export PDF"
        title="Export PDF"
      >
        <FileDown size={14} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-3 rounded-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Export PDF</div>
          <button
            type="button"
            onClick={() => setDraft(EMPTY_DRAFT)}
            disabled={saving}
            className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            Default
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            id="design-pdf-width"
            label="Width"
            value={draft.widthPx}
            disabled={saving}
            onChange={(value) => updateDraft("widthPx", value)}
          />
          <NumberField
            id="design-pdf-height"
            label="Height"
            value={draft.heightPx}
            disabled={saving}
            onChange={(value) => updateDraft("heightPx", value)}
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <NumberField
            id="design-pdf-margin-top"
            label="Top"
            value={draft.marginTopPx}
            disabled={saving}
            onChange={(value) => updateDraft("marginTopPx", value)}
          />
          <NumberField
            id="design-pdf-margin-right"
            label="Right"
            value={draft.marginRightPx}
            disabled={saving}
            onChange={(value) => updateDraft("marginRightPx", value)}
          />
          <NumberField
            id="design-pdf-margin-bottom"
            label="Bottom"
            value={draft.marginBottomPx}
            disabled={saving}
            onChange={(value) => updateDraft("marginBottomPx", value)}
          />
          <NumberField
            id="design-pdf-margin-left"
            label="Left"
            value={draft.marginLeftPx}
            disabled={saving}
            onChange={(value) => updateDraft("marginLeftPx", value)}
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
            Export
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NumberField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        className="h-8 text-xs"
      />
    </div>
  );
}
