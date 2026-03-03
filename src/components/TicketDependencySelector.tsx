import { useState } from 'react';
import type { ChannelTicketInfo } from './RunButtons';

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  in_progress: 'text-accent-light bg-accent-light/10',
  creation: 'text-orange-400 bg-orange-400/10',
  completed: 'text-green-400 bg-green-400/10',
  queued: 'text-cyan-400 bg-cyan-400/10',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  creation: 'Creating',
  completed: 'Completed',
  queued: 'Queued',
};

export function TicketDependencySelector({
  tickets,
  onConfirm,
  onCancel,
}: {
  tickets: ChannelTicketInfo[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Show tickets that haven't been merged yet (completed tickets are valid dependencies)
  const eligibleTickets = tickets.filter((t) => t.status !== 'merged');

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-2 rounded-md border border-edge bg-surface p-2">
      <p className="mb-2 text-xs font-medium text-muted">
        Select tickets to wait on:
      </p>
      {eligibleTickets.length === 0 ? (
        <p className="text-xs text-muted">No eligible tickets to depend on.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {eligibleTickets.map((ticket) => (
            <label
              key={ticket.workspaceId}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-elevated"
            >
              <input
                type="checkbox"
                checked={selected.has(ticket.workspaceId)}
                onChange={() => toggle(ticket.workspaceId)}
                className="accent-accent"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-primary">
                {ticket.title}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[ticket.status] ?? 'text-muted bg-surface-elevated'}`}>
                {STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm([...selected])}
          disabled={selected.size === 0}
          className="flex-1 cursor-pointer rounded bg-cyan-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Queue ({selected.size})
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border border-edge px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-elevated"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
