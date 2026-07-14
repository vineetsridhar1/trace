import { useState } from "react";
import { createDesignSession } from "../../lib/create-quick-session";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";

export function NewDesignSessionDialog() {
  const open = useCommandPaletteStore((state) => state.newDesignSessionOpen);
  const setOpen = useCommandPaletteStore((state) => state.setNewDesignSessionOpen);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (!(await createDesignSession(prompt))) return;
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
          <DialogTitle>New Design</DialogTitle>
          <DialogDescription>
            Describe the product flow, screens, states, or variations you want to explore on a live
            canvas.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="new-design-prompt" className="sr-only">
          Design brief
        </label>
        <Textarea
          id="new-design-prompt"
          name="design-brief"
          autoComplete="off"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Describe your design…"
          className="min-h-28"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!prompt.trim() || submitting}>
            {submitting ? "Creating…" : "Create Design"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
