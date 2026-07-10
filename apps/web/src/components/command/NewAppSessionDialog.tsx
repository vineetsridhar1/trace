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
import { useCommandPaletteStore } from "../../stores/command-palette";
import { createAppSession } from "../../lib/create-quick-session";

// Prompt-first entry point for app sessions. Uses a real dialog rather than
// window.prompt(), which throws in the Electron renderer.
export function NewAppSessionDialog() {
  const open = useCommandPaletteStore((s) => s.newAppSessionOpen);
  const setOpen = useCommandPaletteStore((s) => s.setNewAppSessionOpen);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await createAppSession(trimmed);
      if (!created) return;
      setOpen(false);
      setPrompt("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPrompt("");
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New App Session</DialogTitle>
          <DialogDescription>
            Describe the full-stack app you want Trace to build. It runs in its own cloud workspace
            — it can install packages, run services, and connect to a database.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="new-app-prompt" className="sr-only">
          App description
        </label>
        <Textarea
          id="new-app-prompt"
          name="app-description"
          autoComplete="off"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Describe your app…"
          className="min-h-28"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!prompt.trim() || submitting}>
            {submitting ? "Creating…" : "Build App"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
