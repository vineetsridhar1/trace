import { useEffect } from "react";
import { FiX } from "react-icons/fi";
import type { KanbanTicket } from "../types";
import { TicketView } from "./TicketView";

interface TicketDetailModalProps {
  ticket: KanbanTicket;
  onClose: () => void;
  onOpenWorkspace?: () => void;
}

export function TicketDetailModal({
  ticket,
  onClose,
  onOpenWorkspace,
}: TicketDetailModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-[600px] max-h-[80vh] flex-col rounded-lg border border-edge bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-primary">
            {ticket.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-primary"
          >
            <FiX className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TicketView ticket={ticket} />
        </div>

        {onOpenWorkspace && (
          <div className="flex justify-end border-t border-edge px-5 py-3">
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-light"
            >
              Open Workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
