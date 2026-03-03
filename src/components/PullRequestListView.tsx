import { useCallback, useMemo, useState } from 'react';
import { FiExternalLink, FiGitPullRequest, FiRefreshCw, FiSearch, FiDownload, FiLoader } from 'react-icons/fi';
import type { PullRequest, Workspace } from '../types';
import { usePullRequests } from '../hooks/usePullRequests';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface PullRequestListViewProps {
  repoPath: string | null;
  onPullPR: (pr: PullRequest) => void;
  onOpenWorkspace: (workspace: Workspace) => void;
  workspaces: Workspace[];
  pullingPRNumbers: Set<number>;
}

export function PullRequestListView({ repoPath, onPullPR, onOpenWorkspace, workspaces, pullingPRNumbers }: PullRequestListViewProps) {
  const { pullRequests, loading, error, refresh } = usePullRequests(repoPath);
  const [search, setSearch] = useState('');

  const workspaceByBranch = useMemo(() => {
    const map = new Map<string, Workspace>();
    for (const ws of workspaces) {
      if (ws.branch) map.set(ws.branch, ws);
    }
    return map;
  }, [workspaces]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pullRequests;
    const q = search.toLowerCase();
    return pullRequests.filter(
      (pr) =>
        pr.title.toLowerCase().includes(q) ||
        String(pr.number).includes(q) ||
        pr.author.login.toLowerCase().includes(q) ||
        pr.headRefName.toLowerCase().includes(q),
    );
  }, [pullRequests, search]);

  const handlePull = useCallback(
    (pr: PullRequest) => {
      onPullPR(pr);
    },
    [onPullPR],
  );

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4">
        <FiGitPullRequest className="h-8 w-8 text-muted" />
        <p className="text-center text-sm text-muted">
          {error.includes('ENOENT') || error.includes('not found')
            ? 'GitHub CLI (gh) is not installed or not authenticated. Install it to view pull requests.'
            : error}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-elevated"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter pull requests..."
            className="w-full rounded-md border border-edge bg-surface-elevated py-1.5 pl-8 pr-3 text-xs text-primary outline-none placeholder:text-muted focus:border-accent/50"
          />
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-primary disabled:opacity-50"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* PR list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && pullRequests.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <FiLoader className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <FiGitPullRequest className="h-6 w-6 text-muted" />
            <p className="text-sm text-muted">
              {search.trim() ? 'No matching pull requests' : 'No open pull requests'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col py-1">
            {filtered.map((pr) => {
              const isPulling = pullingPRNumbers.has(pr.number);
              const existingWorkspace = workspaceByBranch.get(pr.headRefName);
              return (
                <div
                  key={pr.number}
                  className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-elevated/50"
                >
                  <FiGitPullRequest className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted">#{pr.number}</span>
                      <span className="truncate text-sm font-medium text-primary">{pr.title}</span>
                      {pr.isDraft && (
                        <span className="flex-shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11px] text-muted">
                        {pr.author.login} · {timeAgo(pr.updatedAt)}
                      </span>
                      <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-accent">
                        {pr.headRefName}
                      </span>
                    </div>
                  </div>
                  {existingWorkspace ? (
                    <button
                      type="button"
                      onClick={() => onOpenWorkspace(existingWorkspace)}
                      className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-elevated"
                    >
                      <FiExternalLink className="h-3 w-3" />
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePull(pr)}
                      disabled={isPulling}
                      className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent-light transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPulling ? (
                        <FiLoader className="h-3 w-3 animate-spin" />
                      ) : (
                        <FiDownload className="h-3 w-3" />
                      )}
                      {isPulling ? 'Pulling...' : 'Pull'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
