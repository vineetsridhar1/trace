import { useState, useCallback, useRef, useEffect } from 'react';
import { FiCheck, FiAlertCircle, FiDownload, FiRefreshCw } from 'react-icons/fi';
import { useSyncStore } from '../stores/syncStore';
import { useChannelContext } from '../context/ChannelContext';
import { CommitPopover } from './CommitPopover';

export function SyncStatus() {
  const { enrichedActiveChannel } = useChannelContext();
  const repoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const baseBranch = enrichedActiveChannel?.baseBranch || 'main';
  const isChecking = useSyncStore((s) => s.isChecking);
  const isPulling = useSyncStore((s) => s.isPulling);
  const isUpToDate = useSyncStore((s) => s.isUpToDate);
  const commitsBehind = useSyncStore((s) => s.commitsBehind);
  const behindCommits = useSyncStore((s) => s.behindCommits);
  const syncError = useSyncStore((s) => s.error);

  // ─── Commit popover on hover ───────────────────────────────────
  const [showPopover, setShowPopover] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!commitsBehind || behindCommits.length === 0) return;
    hoverTimerRef.current = setTimeout(() => {
      const rect = spanRef.current?.getBoundingClientRect();
      if (rect) {
        setTriggerRect(rect);
        setShowPopover(true);
      }
    }, 400);
  }, [commitsBehind, behindCommits.length]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setShowPopover(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  if (!repoPath || (isUpToDate === null && !syncError)) return null;

  return (
    <div className="flex items-center gap-2 border-t border-edge px-3 py-2">
      {isChecking ? (
        <>
          <FiRefreshCw className="h-3 w-3 animate-spin text-muted" />
          <span className="text-xs text-muted">Checking {baseBranch}...</span>
        </>
      ) : syncError ? (
        <>
          <FiAlertCircle className="h-3 w-3 text-red-400" />
          <span className="min-w-0 flex-1 truncate text-xs text-red-400">{syncError}</span>
          <button
            type="button"
            onClick={() => void useSyncStore.getState().checkMainBranch(repoPath, baseBranch)}
            className="cursor-pointer text-xs text-muted hover:text-primary transition-colors"
          >
            <FiRefreshCw className="h-3 w-3" />
          </button>
        </>
      ) : isUpToDate ? (
        <>
          <FiCheck className="h-3 w-3 text-green-400" />
          <span className="text-xs text-green-400">{baseBranch} is up to date</span>
          <button
            type="button"
            onClick={() => void useSyncStore.getState().checkMainBranch(repoPath, baseBranch)}
            className="ml-auto cursor-pointer text-xs text-muted hover:text-primary transition-colors"
          >
            <FiRefreshCw className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <FiAlertCircle className="h-3 w-3 text-yellow-400" />
          <span
            ref={spanRef}
            className="cursor-default text-xs text-yellow-400"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {baseBranch} is {commitsBehind} commit{commitsBehind !== 1 ? 's' : ''} behind
          </span>
          <button
            type="button"
            onClick={() => void useSyncStore.getState().pullMainBranch(repoPath, baseBranch)}
            disabled={isPulling}
            className="ml-auto flex cursor-pointer items-center gap-1 rounded bg-surface-elevated px-2 py-0.5 text-xs text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {isPulling ? (
              <FiRefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <FiDownload className="h-3 w-3" />
            )}
            Pull
          </button>
          {showPopover && triggerRect && (
            <CommitPopover
              commits={behindCommits}
              totalBehind={commitsBehind}
              triggerRect={triggerRect}
            />
          )}
        </>
      )}
    </div>
  );
}
