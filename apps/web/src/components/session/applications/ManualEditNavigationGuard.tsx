import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { registerNavigationBlocker } from "@/lib/navigation-blocker";
import { hasUnsavedManualEdits, useDesignEditorStore } from "@/stores/design-editor";

export function ManualEditNavigationGuard() {
  const activeSessionGroupId = useDesignEditorStore((state) => state.activeSessionGroupId);
  const draftCount = useDesignEditorStore((state) => Object.keys(state.drafts).length);
  const saving = useDesignEditorStore((state) => state.saving);
  const error = useDesignEditorStore((state) => state.error);
  const pendingRef = useRef<(() => void) | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [saveAndLeave, setSaveAndLeave] = useState(false);

  useEffect(
    () =>
      registerNavigationBlocker((continueNavigation) => {
        if (!hasUnsavedManualEdits()) return false;
        if (!pendingRef.current) {
          const editor = useDesignEditorStore.getState();
          pendingRef.current = continueNavigation;
          setPendingNavigation(() => continueNavigation);
          setSaveAndLeave(editor.saving && editor.finishRequested);
        }
        return true;
      }),
    [],
  );

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedManualEdits()) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!pendingNavigation) return;
    if (!saving && draftCount === 0) {
      const continueNavigation = pendingNavigation;
      pendingRef.current = null;
      setPendingNavigation(null);
      setSaveAndLeave(false);
      continueNavigation();
      return;
    }
    if (saveAndLeave && !saving && error) setSaveAndLeave(false);
  }, [draftCount, error, pendingNavigation, saveAndLeave, saving]);

  function cancelNavigation() {
    if (saving) return;
    pendingRef.current = null;
    setPendingNavigation(null);
    setSaveAndLeave(false);
  }

  function discardAndLeave() {
    if (saving) return;
    const continueNavigation = pendingRef.current;
    if (activeSessionGroupId) {
      useDesignEditorStore.getState().stop(activeSessionGroupId);
    }
    pendingRef.current = null;
    setPendingNavigation(null);
    setSaveAndLeave(false);
    continueNavigation?.();
  }

  function saveThenLeave() {
    if (!activeSessionGroupId || saving) return;
    setSaveAndLeave(true);
    void useDesignEditorStore.getState().finish(activeSessionGroupId);
  }

  return (
    <Dialog open={pendingNavigation !== null} onOpenChange={(open) => !open && cancelNavigation()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save changes before leaving?</DialogTitle>
          <DialogDescription>
            You have {draftCount} unsaved {draftCount === 1 ? "element" : "elements"}. Save your
            manual edits before opening another page, or discard them and continue.
          </DialogDescription>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={discardAndLeave}
            disabled={saving}
            className="sm:mr-auto"
          >
            Discard
          </Button>
          <Button variant="outline" onClick={cancelNavigation} disabled={saving}>
            Keep editing
          </Button>
          <Button onClick={saveThenLeave} disabled={saving || draftCount === 0}>
            {saveAndLeave || saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
