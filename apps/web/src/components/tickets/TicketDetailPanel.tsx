import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { TicketDetailsSection } from "./TicketDetailsSection";
import type { TicketRow } from "./tickets-table-types";

interface TicketDetailPanelProps {
  ticket: TicketRow | null;
  onClose: () => void;
}

export function TicketDetailPanel({ ticket, onClose }: TicketDetailPanelProps) {
  const isOpen = ticket !== null;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        onClose();
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className={cn(
        "absolute right-0 top-0 h-full w-[400px] border-l border-border bg-background transition-transform duration-200 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      {ticket && (
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {ticket.title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <TicketDetailsSection ticket={ticket} />
          </div>
        </div>
      )}
    </div>
  );
}
