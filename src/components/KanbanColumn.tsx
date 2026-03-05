import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { KanbanColumn as KanbanColumnType, KanbanTicket } from "../types";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  column: KanbanColumnType;
  onClickTicket: (ticket: KanbanTicket) => void;
  onDropTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onCreatePR?: (workspaceId: string) => void;
}

const noop = () => {};

export function KanbanColumn({
  column,
  onClickTicket,
  onDropTicket,
  onDeleteWorkspace,
  onCreatePR,
}: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const ticketId = e.dataTransfer.getData("text/plain");
      if (ticketId) {
        onDropTicket(ticketId, column.id, column.tickets.length);
      }
    },
    [column.id, column.tickets.length, onDropTicket],
  );

  return (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col rounded-lg bg-surface">
      <div className="flex items-center gap-2 px-3 py-3">
        {column.color && (
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
          />
        )}
        <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">
          {column.name}
        </h3>
        <span className="ml-auto rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-muted">
          {column.tickets.length}
        </span>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 transition-colors ${
          dragOver
            ? "bg-accent/5 ring-1 ring-inset ring-accent/20 rounded-lg"
            : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {column.tickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <KanbanCard
                ticket={ticket}
                onClickTicket={onClickTicket}
                onDragStart={noop}
                onDeleteWorkspace={onDeleteWorkspace}
                onCreatePR={onCreatePR}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {column.tickets.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-edge py-8 text-xs text-muted">
            No tickets
          </div>
        )}
      </div>
    </div>
  );
}
