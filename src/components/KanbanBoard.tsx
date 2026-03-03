import { useCallback } from 'react';
import type { KanbanColumn as KanbanColumnType } from '../types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  columns: KanbanColumnType[];
  loading: boolean;
  onClickTicket: (workspaceId: string | null) => void;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onCreatePR?: (workspaceId: string) => void;
}

export function KanbanBoard({ columns, loading, onClickTicket, onMoveTicket, onDeleteWorkspace, onCreatePR }: KanbanBoardProps) {
  const handleDropTicket = useCallback(
    (ticketId: string, columnId: string, sortOrder: number) => {
      onMoveTicket(ticketId, columnId, sortOrder);
    },
    [onMoveTicket],
  );

  if (loading && columns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto bg-surface px-3 py-3">
        {Array.from({ length: 4 }, (_, colIdx) => (
          <div key={colIdx} className="flex w-[280px] flex-shrink-0 flex-col gap-2 rounded-lg bg-surface-elevated p-3">
            <div className="h-5 w-24 rounded bg-edge animate-pulse" />
            {Array.from({ length: colIdx === 0 ? 3 : 2 }, (_, cardIdx) => (
              <div key={cardIdx} className="flex flex-col gap-2 rounded-lg bg-surface-deep p-3">
                <div className="h-4 w-4/5 rounded bg-edge animate-pulse" />
                <div className="h-3 w-3/5 rounded bg-edge animate-pulse" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto bg-surface px-3 py-3">
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          onClickTicket={onClickTicket}
          onDropTicket={handleDropTicket}
          onDeleteWorkspace={onDeleteWorkspace}
          onCreatePR={onCreatePR}
        />
      ))}
    </div>
  );
}
