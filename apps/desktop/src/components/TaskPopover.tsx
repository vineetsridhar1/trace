import { FiCheck } from 'react-icons/fi';
import type { KanbanTicket } from '../types';
import { STATUS_CONFIG } from './MessageItem';

const GAP = 6;
const ESTIMATED_HEIGHT = 160;

type TodoItem = { content: string; status: string; activeForm?: string };

interface TaskPopoverProps {
  ticket: KanbanTicket;
  triggerRect: DOMRect;
  summary?: string | null;
  todos?: TodoItem[];
}

export function TaskPopover({ ticket, triggerRect, summary, todos }: TaskPopoverProps) {
  const status = (ticket.workspace?.status ?? ticket.status ?? 'pending') as keyof typeof STATUS_CONFIG;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  // Position below by default, flip above if not enough space
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const placeBelow = spaceBelow >= ESTIMATED_HEIGHT + GAP;
  const top = placeBelow
    ? triggerRect.bottom + GAP
    : triggerRect.top - ESTIMATED_HEIGHT - GAP;

  // Horizontally align to trigger left, clamp to viewport
  const left = Math.max(4, Math.min(triggerRect.left, window.innerWidth - 292));

  // Pick the best "where is it at" content
  const hasTodos = todos && todos.length > 0;
  const fallbackText = !hasTodos ? (summary || ticket.solutionApproach) : null;

  return (
    <div
      className="pointer-events-none fixed z-[9999] w-72 animate-fade-in rounded-md border border-edge bg-surface-elevated/75 p-3 shadow-lg backdrop-blur-md"
      style={{ top, left }}
    >
      {/* Full title */}
      <h4 className="text-sm font-medium text-primary">{ticket.title}</h4>

      {/* Status badge */}
      <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color} ${config.bgColor}`}>
        {config.label}
      </span>

      {/* Task list */}
      {hasTodos && (
        <ul className="mt-2 space-y-0.5">
          {todos.map((t, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs">
              {t.status === 'in_progress' ? (
                <svg className="h-3 w-3 flex-shrink-0 animate-spin text-accent-light" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                </svg>
              ) : t.status === 'completed' ? (
                <FiCheck className="h-3 w-3 flex-shrink-0 text-green-400" />
              ) : (
                <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-muted" />
              )}
              <span className={
                t.status === 'completed' ? 'truncate text-muted line-through' :
                t.status === 'in_progress' ? 'truncate text-accent-light' :
                'truncate text-primary'
              }>
                {t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Fallback: summary or solution approach */}
      {fallbackText && (
        <p className="mt-2 line-clamp-3 text-xs text-muted">{fallbackText}</p>
      )}
    </div>
  );
}
