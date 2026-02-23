import type { KanbanTicket } from '../types';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-yellow-400 bg-yellow-400/10' },
  in_progress: { label: 'In Progress', className: 'text-blue-400 bg-blue-400/10' },
  completed: { label: 'Completed', className: 'text-green-400 bg-green-400/10' },
};

const COMPLEXITY_CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-green-400 bg-green-400/10' },
  medium: { label: 'Medium', className: 'text-yellow-400 bg-yellow-400/10' },
  high: { label: 'High', className: 'text-red-400 bg-red-400/10' },
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

      {ticket.metadata != null && (() => {
        const meta = ticket.metadata as { tags?: string[]; complexity?: string };
        const hasTags = Array.isArray(meta.tags) && meta.tags.length > 0;
        const complexityConfig = meta.complexity ? COMPLEXITY_CONFIG[meta.complexity] : null;
        if (!hasTags && !complexityConfig) return null;
        return (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {complexityConfig && (
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${complexityConfig.className}`}>
                {complexityConfig.label} complexity
              </span>
            )}
            {hasTags && (meta.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] font-medium text-[#a9b1d6]"
              >
                {tag}
              </span>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
