import { MousePointer2, RotateCcw } from "lucide-react";
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
import { DesignEditorDomTree } from "./DesignEditorDomTree";
import { DesignEditorPropertySection } from "./DesignEditorPropertySection";

export function DesignManualEditPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const {
    target,
    domTree,
    draftCount,
    loading,
    saving,
    error,
    stop,
    changeText,
    changeStyle,
    resetChanges,
    cancelSelection,
    activateElement,
    hoverElement,
    save,
  } = useDesignEditorStore(
    useShallow((state) => ({
      target: state.target,
      domTree: state.domTree,
      draftCount: Object.keys(state.drafts).length,
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      stop: state.stop,
      changeText: state.changeText,
      changeStyle: state.changeStyle,
      resetChanges: state.resetChanges,
      cancelSelection: state.cancelSelection,
      activateElement: state.activateElement,
      hoverElement: state.hoverElement,
      save: state.save,
    })),
  );
  const dirty = designEditorTextDirty(target) || designEditorStylesDirty(target);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Edit</h2>
          {draftCount > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {draftCount} unsaved {draftCount === 1 ? "element" : "elements"}
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => stop(sessionGroupId)}>
          Discard
        </Button>
        <Button size="sm" disabled={draftCount === 0 || saving} onClick={() => void save()}>
          {saving ? "Saving…" : draftCount > 1 ? `Save ${draftCount}` : "Save"}
        </Button>
      </header>

      {domTree.length > 0 ? (
        <DesignEditorDomTree
          nodes={domTree}
          selectedElementId={target?.elementId ?? null}
          onSelect={activateElement}
          onHover={hoverElement}
        />
      ) : null}

      {target ? (
        <>
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
              <MousePointer2 className="size-4" />
            </span>
            <span className="mx-1 h-5 w-px bg-border" />
            <span className="min-w-0 flex-1 truncate px-1 font-mono text-[10px] text-muted-foreground">
              &lt;{target.elementName}&gt; · {target.elementId}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Reset selected element"
              disabled={!dirty || saving}
              onClick={resetChanges}
            >
              <RotateCcw className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={cancelSelection}>
              Done
            </Button>
          </div>
        </>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <TraceLoader size={16} showLabel={false} />
          </div>
        ) : target ? (
          <div>
            <DesignEditorPropertySection title="Content">
              <label className="block space-y-1.5 text-[11px]">
                <span className="text-muted-foreground">Content</span>
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
              <p
                className="truncate font-mono text-[9px] text-muted-foreground/60"
                title={target.filePath}
              >
                {target.filePath}
              </p>
            </DesignEditorPropertySection>

            <DesignEditorStyleControls styles={target.draftStyles} onChange={changeStyle} />
          </div>
        ) : (
          <div className="flex h-full min-h-72 flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-border bg-muted/35 shadow-xs">
              <MousePointer2 className="size-4 text-foreground" />
            </div>
            <p className="text-sm font-medium">Click any element on the canvas to edit it.</p>
            <p className="mt-2 max-w-56 text-xs leading-5 text-muted-foreground">
              Move between elements freely. Your changes stay previewed until you save or discard
              them.
            </p>
          </div>
        )}
      </div>

      {error ? (
        <p className="shrink-0 border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
