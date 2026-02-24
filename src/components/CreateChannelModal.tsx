import { useState, useCallback, useEffect, useRef } from 'react';
import { SERVER_URL } from '../types';

interface CreateChannelModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateChannelModal({ onClose, onCreated }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [localRepoPath, setLocalRepoPath] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [repoValid, setRepoValid] = useState<boolean | null>(null);
  const [detectedGithubUrl, setDetectedGithubUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!localRepoPath.trim()) {
      setRepoValid(null);
      setDetectedGithubUrl(null);
      setError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setValidating(true);
      setError(null);
      try {
        const res = await fetch(`${SERVER_URL}/channels/validate-repo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ localRepoPath: localRepoPath.trim() }),
        });
        const data = (await res.json()) as { valid: boolean; githubUrl?: string; error?: string };
        setRepoValid(data.valid);
        setDetectedGithubUrl(data.githubUrl ?? null);
        if (!data.valid && data.error) {
          setError(data.error);
        }
      } catch {
        setRepoValid(false);
        setError('Failed to validate path');
      } finally {
        setValidating(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localRepoPath]);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          localRepoPath: localRepoPath.trim() || null,
          baseBranch: baseBranch.trim() || 'main',
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to create channel');
        return;
      }

      onCreated();
    } catch {
      setError('Failed to create channel');
    } finally {
      setCreating(false);
    }
  }, [name, localRepoPath, baseBranch, onCreated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-[#292e42] bg-[#1a1b26] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#292e42] px-5 py-3">
          <h2 className="text-sm font-semibold text-[#c0caf5]">Create Channel</h2>
          <button type="button" onClick={onClose} className="text-[#565f89] hover:text-[#c0caf5]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              autoFocus
              className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Local Repo Path</label>
            <input
              type="text"
              value={localRepoPath}
              onChange={(e) => setLocalRepoPath(e.target.value)}
              placeholder="/path/to/git/repo"
              className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
            />
            {validating && (
              <p className="mt-1 text-[10px] text-[#565f89]">Validating...</p>
            )}
            {repoValid === true && (
              <p className="mt-1 text-[10px] text-[#9ece6a]">
                Valid git repository
                {detectedGithubUrl && (
                  <span className="ml-1 text-[#565f89]">({detectedGithubUrl})</span>
                )}
              </p>
            )}
            {repoValid === false && error && (
              <p className="mt-1 text-[10px] text-[#f7768e]">{error}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Base Branch</label>
            <input
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
            />
            <p className="mt-1 text-[10px] text-[#3b4261]">Branch to merge worktrees into (defaults to main)</p>
          </div>

          {error && repoValid !== false && (
            <p className="text-xs text-[#f7768e]">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#292e42] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="rounded bg-[#7aa2f7] px-3 py-1.5 text-xs font-medium text-[#1a1b26] hover:bg-[#89b4fa] disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
