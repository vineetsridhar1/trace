import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useEntityField } from "@trace/client-core";
import { TicketDetailsSection } from "./TicketDetailsSection";
import { TICKET_DETAIL_PANEL_WIDTH } from "./tickets-table-types";

interface TicketDetailPanelProps {
  ticketId: string | null;
  onClose: () => void;
}

export function TicketDetailPanel({ ticketId, onClose }: TicketDetailPanelProps) {
  const isOpen = ticketId !== null;
  const title = useEntityField("tickets", ticketId ?? "", "title");

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={cn(
        `absolute right-0 top-0 h-full border-l border-border bg-background transition-transform duration-200 ease-in-out`,
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
      style={{ width: TICKET_DETAIL_PANEL_WIDTH }}
    >
      {ticketId && (
        <div className="flex h-full flex-col">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <TicketDetailsSection ticketId={ticketId} />
          </div>
        </div>
      )}
    </div>
  );
}
