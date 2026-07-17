import { useEffect } from "react";
import { createAppSession, createDesignSession } from "../../lib/create-quick-session";
import { useCommandPaletteStore } from "../../stores/command-palette";

export function NewGeneratedProjectDialog() {
  const kind = useCommandPaletteStore((state) => state.newGeneratedProjectKind);
  const close = useCommandPaletteStore((state) => state.closeGeneratedProjectDialog);

  useEffect(() => {
    if (!kind) return;
    close();
    void (kind === "design" ? createDesignSession() : createAppSession());
  }, [close, kind]);

  return null;
}
