import { FiGitCommit } from 'react-icons/fi';
import type { SyncCommit } from '../stores/syncStore';

const GAP = 6;
const ESTIMATED_HEIGHT = 200;

interface CommitPopoverProps {
  commits: SyncCommit[];
  totalBehind: number;
  triggerRect: DOMRect;
}

export function CommitPopover({ commits, totalBehind, triggerRect }: CommitPopoverProps) {
  // Position above by default since this is at the bottom of the panel
  const spaceAbove = triggerRect.top;
  const placeAbove = spaceAbove >= ESTIMATED_HEIGHT + GAP;
  const top = placeAbove
    ? triggerRect.top - ESTIMATED_HEIGHT - GAP
    : triggerRect.bottom + GAP;

  const left = Math.max(4, Math.min(triggerRect.left, window.innerWidth - 292));

  return (
    <div
      className="pointer-events-none fixed z-[9999] w-72 animate-fade-in rounded-md border border-edge bg-surface-elevated/75 p-3 shadow-lg backdrop-blur-md"
      style={{ top, left, maxHeight: ESTIMATED_HEIGHT }}
    >
      <h4 className="text-xs font-medium text-muted">
        {totalBehind} incoming commit{totalBehind !== 1 ? 's' : ''}
      </h4>

      <ul className="mt-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: ESTIMATED_HEIGHT - 48 }}>
        {commits.map((c) => (
          <li key={c.hash} className="flex items-start gap-1.5 text-xs">
            <FiGitCommit className="mt-0.5 h-3 w-3 flex-shrink-0 text-yellow-400" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-primary">{c.message}</span>
              <span className="text-[10px] text-muted">
                {c.hash} by {c.author} · {c.date}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {totalBehind > commits.length && (
        <p className="mt-1.5 text-[10px] text-muted">
          and {totalBehind - commits.length} more...
        </p>
      )}
    </div>
  );
}
