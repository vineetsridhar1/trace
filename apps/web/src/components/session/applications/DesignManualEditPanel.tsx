import { MousePointer2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { TraceLoader } from "../../ui/trace-loader";
import {
  designEditorStylesDirty,
  designEditorTextDirty,
  useDesignEditorStore,
} from "../../../stores/design-editor";
import { DesignEditorStyleControls } from "./DesignEditorStyleControls";

export function DesignManualEditPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const { target, loading, saving, error, stop, changeText, changeStyle, cancelSelection, save } =
    useDesignEditorStore(
      useShallow((state) => ({
        target: state.target,
        loading: state.loading,
        saving: state.saving,
        error: state.error,
        stop: state.stop,
        changeText: state.changeText,
        changeStyle: state.changeStyle,
        cancelSelection: state.cancelSelection,
        save: state.save,
      })),
    );
  const dirty = designEditorTextDirty(target) || designEditorStylesDirty(target);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div>
          <h2 className="text-sm font-medium">Element editor</h2>
          <p className="text-[10px] text-muted-foreground">Changes preview live</p>
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
          <div className="space-y-5 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {target.elementName}
                </span>
                <span className="truncate text-xs font-medium">{target.elementId}</span>
              </div>
              <p
                className="mt-1 truncate text-[10px] text-muted-foreground"
                title={target.filePath}
              >
                {target.filePath}
              </p>
            </div>

            <section className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Content
              </h3>
              <label className="block space-y-1.5 text-xs">
                <span className="text-muted-foreground">Text</span>
                <Input
                  value={target.draftText}
                  maxLength={2_000}
                  disabled={!target.editableText}
                  onChange={(event) => changeText(event.target.value)}
                />
              </label>
              {!target.editableText ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Nested or dynamic content can’t be replaced as plain text, but its appearance can
                  still be edited.
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

      <footer className="flex shrink-0 justify-end gap-2 border-t border-border p-3">
        <Button size="sm" variant="outline" disabled={!target || saving} onClick={cancelSelection}>
          Deselect
        </Button>
        <Button size="sm" disabled={!target || !dirty || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </footer>
    </div>
  );
}
