import { memo } from 'react';
import type { KanbanTicket } from '../types';
import { formatTime } from '../utils';

interface KanbanCardProps {
  ticket: KanbanTicket;
  onClickTicket: (messageId: string) => void;
  onDragStart: (ticketId: string) => void;
}

export const KanbanCard = memo(function KanbanCard({
  ticket,
  onClickTicket,
  onDragStart,
}: KanbanCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', ticket.id);
        onDragStart(ticket.id);
      }}
      onClick={() => onClickTicket(ticket.messageId)}
      className="group cursor-pointer rounded-lg border border-[#292e42] bg-[#1f2335] p-3 transition-all hover:border-[#3b4261] hover:bg-[#24283b] active:scale-[0.98]"
    >
      <h4 className="line-clamp-2 text-sm font-medium text-[#c0caf5]">{ticket.title}</h4>

      {ticket.description && (
        <p className="mt-1 line-clamp-2 text-xs text-[#565f89]">{ticket.description}</p>
      )}

      {ticket.solutionApproach && (
        <p className="mt-1.5 line-clamp-1 text-xs text-[#7aa2f7]/70">
          <span className="mr-1">&#9672;</span>
          {ticket.solutionApproach}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        {ticket.message.branch && (
          <span className="truncate rounded bg-[#1a1b26] px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
            {ticket.message.branch.replace(/^trace\//, '')}
          </span>
        )}
        <span className="ml-auto text-[10px] text-[#565f89]">
          {formatTime(ticket.createdAt)}
        </span>
      </div>
    </div>
  );
});
