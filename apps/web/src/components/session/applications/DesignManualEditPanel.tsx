import { Pencil, X } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { TraceLoader } from "../../ui/trace-loader";
import type { DesignManualEditTarget } from "./useDesignManualEdit";

export function DesignManualEditPanel({
  target,
  draft,
  loading,
  saving,
  error,
  dirty,
  onChange,
  onCancel,
  onSave,
}: {
  target: DesignManualEditTarget | null;
  draft: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <aside className="absolute right-3 top-12 z-30 w-80 rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">Edit text</span>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Close text editor" onClick={onCancel}>
          <X className="size-3.5" />
        </Button>
      </div>
      <form
        className="space-y-3 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        {loading ? (
          <div className="flex h-16 items-center justify-center">
            <TraceLoader size={14} showLabel={false} />
          </div>
        ) : target ? (
          <>
            <div className="space-y-1">
              <label htmlFor="design-element-text" className="text-[11px] text-muted-foreground">
                Content
              </label>
              <Input
                id="design-element-text"
                value={draft}
                maxLength={2_000}
                autoFocus
                onChange={(event) => onChange(event.target.value)}
              />
            </div>
            <p className="truncate text-[10px] text-muted-foreground" title={target.filePath}>
              {target.filePath} · {target.elementId}
            </p>
          </>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">
            Select a static text element in the preview.
          </p>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!target || !dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
