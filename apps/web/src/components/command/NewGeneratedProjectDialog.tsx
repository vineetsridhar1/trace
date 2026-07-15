import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { createAppSession, createDesignSession } from "../../lib/create-quick-session";
import { useCommandPaletteStore } from "../../stores/command-palette";

export function NewGeneratedProjectDialog() {
  const kind = useCommandPaletteStore((state) => state.newGeneratedProjectKind);
  const close = useCommandPaletteStore((state) => state.closeGeneratedProjectDialog);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDesign = kind === "design";

  const dismiss = () => {
    close();
    setPrompt("");
  };

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!kind || !trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = isDesign
        ? await createDesignSession(trimmed)
        : await createAppSession(trimmed);
      if (created) dismiss();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isDesign ? "New Design" : "New App Session"}</DialogTitle>
          <DialogDescription>
            {isDesign
              ? "Describe the screens, states, flow, or visual directions you want Trace to explore."
              : "Describe the full-stack app you want Trace to build in its own cloud workspace."}
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="new-generated-project-prompt" className="sr-only">
          {isDesign ? "Design brief" : "App description"}
        </label>
        <Textarea
          id="new-generated-project-prompt"
          name={isDesign ? "design-brief" : "app-description"}
          autoComplete="off"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={isDesign ? "Describe the design…" : "Describe your app…"}
          className="min-h-28"
        />
        <DialogFooter>
          <Button variant="outline" onClick={dismiss} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!prompt.trim() || submitting}>
            {submitting ? "Creating…" : isDesign ? "Create Design" : "Build App"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
