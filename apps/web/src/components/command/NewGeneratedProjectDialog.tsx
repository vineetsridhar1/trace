import { useEffect } from "react";
import { createAppSession, createDesignSession, createPdfSession } from "../../lib/create-quick-session";
import { useCommandPaletteStore } from "../../stores/command-palette";

export function NewGeneratedProjectDialog() {
  const kind = useCommandPaletteStore((state) => state.newGeneratedProjectKind);
  const close = useCommandPaletteStore((state) => state.closeGeneratedProjectDialog);

  useEffect(() => {
    if (!kind) return;
    close();
    void (kind === "design" ? createDesignSession() : kind === "pdf" ? createPdfSession() : createAppSession());
  }, [close, kind]);

  return null;
}
