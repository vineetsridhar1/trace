import { memo } from 'react';
import { FiChevronLeft, FiCircle } from 'react-icons/fi';
import type { TicketStatus } from '../types';

const STATUS_LABEL: Record<TicketStatus, string> = {
  pending: 'Pending',
  creation: 'Creating',
  in_progress: 'Running',
  completed: 'Completed',
  merged: 'Merged',
  needs_input: 'Needs Input',
  queued: 'Queued',
  review: 'Review',
  handed_off: 'Handed Off',
};

const STATUS_DOT_COLOR: Record<TicketStatus, string> = {
  pending: 'text-yellow-400',
  creation: 'text-orange-400',
  in_progress: 'text-green-400',
  completed: 'text-gray-400',
  merged: 'text-purple-400',
  needs_input: 'text-amber-400',
  queued: 'text-cyan-400',
  review: 'text-teal-400',
  handed_off: 'text-orange-300',
};

interface WebThreadHeaderProps {
  title: string;
  status: TicketStatus;
  onBack?: () => void;
}

export const WebThreadHeader = memo(function WebThreadHeader({
  title,
  status,
  onBack,
}: WebThreadHeaderProps) {
  const dotColor = STATUS_DOT_COLOR[status] ?? STATUS_DOT_COLOR.pending;
  const label = STATUS_LABEL[status] ?? status;

  return (
    <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
      {onBack && (
        <button
          onClick={onBack}
          className="mobile-back-btn -ml-1 hidden rounded-md p-1.5 text-muted hover:bg-surface-elevated hover:text-primary"
          aria-label="Back to workspaces"
        >
          <FiChevronLeft className="h-5 w-5" />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
        {title}
      </span>
      <span className="shrink-0 flex items-center gap-1.5 rounded-md border border-edge px-2 py-0.5 text-[11px] font-medium text-muted">
        <FiCircle className={`h-2 w-2 fill-current ${dotColor}`} />
        {label}
      </span>
    </div>
  );
});
