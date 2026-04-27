import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import type { SessionGroupRow } from "./sessions-table-types";

export type SessionRowDeleteContextMenuState = {
  row: SessionGroupRow;
  x: number;
  y: number;
};

export function SessionRowDeleteContextMenu({
  menu,
  onClose,
  onDelete,
}: {
  menu: SessionRowDeleteContextMenuState;
  onClose: () => void;
  onDelete: (row: SessionGroupRow) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose} onContextMenu={onClose}>
      <div
        role="menu"
        className="fixed min-w-44 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        style={{ left: menu.x, top: menu.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-surface-hover focus:bg-surface-hover"
          onClick={() => {
            onDelete(menu.row);
            onClose();
          }}
        >
          <Trash2 className="size-4" />
          Delete workspace
        </button>
      </div>
    </div>,
    document.body,
  );
}
