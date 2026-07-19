import { useCallback, useEffect } from "react";
import { AppWindow, Figma, FileText } from "lucide-react";
import {
  createAppSession,
  createDesignSession,
  createPdfSession,
} from "../../lib/create-quick-session";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

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
    Icon: Figma,
  },
  {
    kind: "pdf",
    title: "Document",
    description: "Create a print-ready PDF, report, flyer, or proposal.",
    Icon: FileText,
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
      <DialogContent className="max-w-xl gap-7 p-8">
        <DialogHeader>
          <DialogTitle className="text-3xl tracking-tight">Create new</DialogTitle>
          <DialogDescription>
            Choose the kind of work you want Trace to help you make.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {OPTIONS.map(({ kind: optionKind, title, description, Icon }) => (
            <button
              key={optionKind}
              type="button"
              onClick={() => create(optionKind)}
              className="flex items-center gap-5 rounded-2xl border border-border p-5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-7 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-xl font-semibold text-foreground">{title}</span>
                <span className="mt-1 block text-base text-muted-foreground">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
