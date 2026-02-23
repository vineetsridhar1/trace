import type { KanbanTicket } from '../types';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-yellow-400 bg-yellow-400/10' },
  in_progress: { label: 'In Progress', className: 'text-blue-400 bg-blue-400/10' },
  completed: { label: 'Completed', className: 'text-green-400 bg-green-400/10' },
};

export function TicketView({ ticket }: { ticket: KanbanTicket }) {
  const statusConfig = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.pending;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <h2 className="mb-3 text-lg font-semibold text-[#c0caf5]">{ticket.title}</h2>

      <div className="mb-4 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusConfig.className}`}>
          {statusConfig.label}
        </span>
        {ticket.message.branch && (
          <span className="rounded bg-[#1f2335] px-1.5 py-0.5 font-mono text-[11px] text-[#7aa2f7]">
            {ticket.message.branch}
          </span>
        )}
      </div>

      {ticket.description && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            Description
          </h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#a9b1d6]">
            {ticket.description}
          </p>
        </div>
      )}

      {ticket.solutionApproach && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            Solution Approach
          </h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#a9b1d6]">
            {ticket.solutionApproach}
          </p>
        </div>
      )}

      {ticket.metadata != null && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            Metadata
          </h4>
          <pre className="overflow-x-auto rounded bg-[#1f2335] p-3 text-xs text-[#a9b1d6]">
            {JSON.stringify(ticket.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
