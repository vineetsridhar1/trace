import { useCallback, useState } from 'react';
import type { KanbanColumn as KanbanColumnType } from '../types';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  column: KanbanColumnType;
  onClickTicket: (workspaceId: string) => void;
  onDropTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onCreatePR?: (workspaceId: string) => void;
}

const noop = () => {};

export function KanbanColumn({ column, onClickTicket, onDropTicket, onDeleteWorkspace, onCreatePR }: KanbanColumnProps) {
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
      const ticketId = e.dataTransfer.getData('text/plain');
      if (ticketId) {
        onDropTicket(ticketId, column.id, column.tickets.length);
      }
    },
    [column.id, column.tickets.length, onDropTicket],
  );

  return (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col rounded-lg bg-[#1a1b26]">
      <div className="flex items-center gap-2 px-3 py-3">
        {column.color && (
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />
        )}
        <h3 className="text-xs font-semibold tracking-wide text-[#a9b1d6] uppercase">
          {column.name}
        </h3>
        <span className="ml-auto rounded-full bg-[#1f2335] px-2 py-0.5 text-[10px] font-medium text-[#565f89]">
          {column.tickets.length}
        </span>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 transition-colors ${
          dragOver ? 'bg-violet-500/5 ring-1 ring-inset ring-violet-500/20 rounded-lg' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {column.tickets.map((ticket) => (
          <KanbanCard
            key={ticket.id}
            ticket={ticket}
            onClickTicket={onClickTicket}
            onDragStart={noop}
            onDeleteWorkspace={onDeleteWorkspace}
            onCreatePR={onCreatePR}
          />
        ))}
        {column.tickets.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#292e42] py-8 text-xs text-[#565f89]">
            No tickets
          </div>
        )}
      </div>
    </div>
  );
}
