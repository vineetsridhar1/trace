import { MousePointer2, RotateCcw, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { TraceLoader } from "../../ui/trace-loader";
import {
  designEditorStylesDirty,
  designEditorTextDirty,
  useDesignEditorStore,
} from "../../../stores/design-editor";
import { DesignEditorStyleControls } from "./DesignEditorStyleControls";

export function DesignManualEditPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const {
    target,
    loading,
    saving,
    error,
    stop,
    changeText,
    changeStyle,
    resetChanges,
    cancelSelection,
    save,
  } = useDesignEditorStore(
    useShallow((state) => ({
      target: state.target,
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      stop: state.stop,
      changeText: state.changeText,
      changeStyle: state.changeStyle,
      resetChanges: state.resetChanges,
      cancelSelection: state.cancelSelection,
      save: state.save,
    })),
  );
  const dirty = designEditorTextDirty(target) || designEditorStylesDirty(target);
  const title = target ? readableTargetName(target.elementId, target.draftText) : "Element editor";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium" title={title}>
            {title}
          </h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {dirty ? "Unsaved changes · previewing live" : "Changes preview live"}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Exit design editing"
          onClick={() => stop(sessionGroupId)}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <TraceLoader size={16} showLabel={false} />
          </div>
        ) : target ? (
          <div>
            <div className="min-w-0 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  &lt;{target.elementName.toLowerCase()}&gt;
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {target.elementId}
                </span>
              </div>
              <p
                className="mt-1.5 truncate text-[10px] text-muted-foreground/80"
                title={target.filePath}
              >
                {target.filePath}
              </p>
            </div>

            <section className="space-y-2.5 border-b border-border px-4 py-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Content
              </h3>
              <label className="block space-y-1.5 text-[11px]">
                <span className="text-muted-foreground">Text</span>
                <Textarea
                  value={target.draftText}
                  maxLength={2_000}
                  disabled={!target.editableText}
                  rows={4}
                  className="min-h-20 resize-y text-xs leading-5"
                  onChange={(event) => changeText(event.target.value)}
                />
              </label>
              {!target.editableText ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  {target.autoTarget
                    ? "This element was discovered from the rendered canvas. Its appearance can be saved now; text editing becomes available once it has a source marker."
                    : "Nested or dynamic content can’t be replaced as plain text, but its appearance can still be edited."}
                </p>
              ) : null}
            </section>

            <DesignEditorStyleControls styles={target.draftStyles} onChange={changeStyle} />
          </div>
        ) : (
          <div className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-muted">
              <MousePointer2 className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Select an element</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Click any highlighted element in the design to edit its content and appearance.
            </p>
          </div>
        )}
      </div>

      {error ? (
        <p className="shrink-0 border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <footer className="flex min-h-13 shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!target || !dirty || saving}
          onClick={resetChanges}
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!target || saving} onClick={cancelSelection}>
            Deselect
          </Button>
          <Button size="sm" disabled={!target || !dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function readableTargetName(elementId: string, text: string): string {
  const readableText = text.replace(/\s+/gu, " ").trim();
  if (readableText) {
    return readableText.length > 42 ? `${readableText.slice(0, 39).trim()}…` : readableText;
  }
  const readableId = elementId
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
  return readableId
    ? `${readableId.charAt(0).toUpperCase()}${readableId.slice(1)}`
    : "Selected element";
}
