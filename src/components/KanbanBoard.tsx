import { useCallback } from 'react';
import type { KanbanColumn as KanbanColumnType } from '../types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  columns: KanbanColumnType[];
  loading: boolean;
  onClickTicket: (workspaceId: string) => void;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
}

export function KanbanBoard({ columns, loading, onClickTicket, onMoveTicket }: KanbanBoardProps) {
  const handleDropTicket = useCallback(
    (ticketId: string, columnId: string, sortOrder: number) => {
      onMoveTicket(ticketId, columnId, sortOrder);
    },
    [onMoveTicket],
  );

  if (loading && columns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#1a1b26]">
        <span className="text-sm text-[#565f89]">Loading board...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto bg-[#1a1b26] px-3 py-3">
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          onClickTicket={onClickTicket}
          onDropTicket={handleDropTicket}
        />
      ))}
    </div>
  );
}
