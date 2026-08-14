import { useEffect } from "react";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { createAppSession } from "../../lib/create-quick-session";

export function NewAppSessionDialog() {
  const open = useCommandPaletteStore((s) => s.newAppSessionOpen);
  const setOpen = useCommandPaletteStore((s) => s.setNewAppSessionOpen);

  useEffect(() => {
    if (!open) return;
    setOpen(false);
    void createAppSession();
  }, [open, setOpen]);

  return null;
}
