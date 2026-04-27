import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Archive, GitPullRequest, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionGroupRow } from "./sessions-table-types";

export type SessionRowContextMenuState = {
  row: SessionGroupRow;
  x: number;
  y: number;
};

export function SessionRowContextMenu({
  menu,
  onArchive,
  onClose,
  onCopyLink,
}: {
  menu: SessionRowContextMenuState;
  onArchive: (row: SessionGroupRow) => void;
  onClose: () => void;
  onCopyLink: (row: SessionGroupRow) => void;
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

  const itemClass =
    "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover";

  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose} onContextMenu={onClose}>
      <div
        role="menu"
        className={cn(
          "fixed min-w-44 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
        )}
        style={{ left: menu.x, top: menu.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => {
            onCopyLink(menu.row);
            onClose();
          }}
        >
          <Link2 className="size-4 text-muted-foreground" />
          Copy session link
        </button>
        {menu.row.prUrl && (
          <a
            role="menuitem"
            className={itemClass}
            href={menu.row.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
          >
            <GitPullRequest className="size-4 text-muted-foreground" />
            View PR
          </a>
        )}
        <div className="-mx-1 my-1 h-px bg-border" />
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => {
            onArchive(menu.row);
            onClose();
          }}
        >
          <Archive className="size-4 text-muted-foreground" />
          Archive
        </button>
      </div>
    </div>,
    document.body,
  );
}
