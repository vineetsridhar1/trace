import { useCallback, useEffect } from "react";
import { AppWindow, Palette, ScrollText } from "lucide-react";
import {
  createAppSession,
  createDesignSession,
  createPdfSession,
} from "../../lib/create-quick-session";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type GeneratedProjectKind = "app" | "design" | "pdf";

const OPTIONS: Array<{
  kind: GeneratedProjectKind;
  title: string;
  description: string;
  Icon: typeof AppWindow;
}> = [
  {
    kind: "app",
    title: "App",
    description: "Build a full-stack product with a live preview.",
    Icon: AppWindow,
  },
  {
    kind: "design",
    title: "Design",
    description: "Explore product screens, flows, and visual directions.",
    Icon: Palette,
  },
  {
    kind: "pdf",
    title: "Document",
    description: "Create a print-ready PDF, report, flyer, or proposal.",
    Icon: ScrollText,
  },
];

export function NewGeneratedProjectDialog() {
  const kind = useCommandPaletteStore((state) => state.newGeneratedProjectKind);
  const close = useCommandPaletteStore((state) => state.closeGeneratedProjectDialog);

  const create = useCallback(
    (nextKind: GeneratedProjectKind) => {
      close();
      void (nextKind === "app"
        ? createAppSession()
        : nextKind === "design"
          ? createDesignSession()
          : createPdfSession());
    },
    [close],
  );

  useEffect(() => {
    if (kind && kind !== "choose") create(kind);
  }, [create, kind]);

  return (
    <Dialog open={kind === "choose"} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-4">
          {OPTIONS.map(({ kind: optionKind, title, description, Icon }) => (
            <button
              key={optionKind}
              type="button"
              onClick={() => create(optionKind)}
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon size={20} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
