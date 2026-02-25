import { useState, useCallback } from 'react';
import { useMutation } from 'urql';
import type { LocalChannelConfig } from '../types';
import { graphqlClient } from '../graphql/client';
import { VALIDATE_REPO_QUERY, REPO_BRANCHES_QUERY, CREATE_CHANNEL_MUTATION } from '../graphql/documents/channels';

interface CreateChannelModalProps {
  serverId: string | null;
  onClose: () => void;
  onCreated: () => void;
  onLocalConfigSave: (channelId: string, data: LocalChannelConfig) => Promise<void>;
}

export function CreateChannelModal({ serverId, onClose, onCreated, onLocalConfigSave }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [localRepoPath, setLocalRepoPath] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [branches, setBranches] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [repoValid, setRepoValid] = useState<boolean | null>(null);
  const [detectedOriginUrl, setDetectedOriginUrl] = useState<string | null>(null);
  const [, executeCreateChannel] = useMutation(CREATE_CHANNEL_MUTATION);

  const handleSelectFolder = useCallback(async () => {
    const result = await window.traceAPI.selectFolder();
    if (!result.success || result.canceled || !result.path) return;

    const selectedPath = result.path;
    setLocalRepoPath(selectedPath);
    setError(null);
    setValidating(true);
    setRepoValid(null);
    setDetectedOriginUrl(null);
    setBranches([]);
    setBaseBranch('main');

    try {
      const validateResult = await graphqlClient.query(VALIDATE_REPO_QUERY, { localRepoPath: selectedPath }).toPromise();
      const data = validateResult.data?.validateRepo;

      if (!data?.valid) {
        setRepoValid(false);
        setError(data?.error ?? 'Invalid repository');
        setLocalRepoPath('');
        return;
      }

      setRepoValid(true);
      setDetectedOriginUrl(data.originUrl ?? null);

      // Fetch branches
      const branchResult = await graphqlClient.query(REPO_BRANCHES_QUERY, { localRepoPath: selectedPath }).toPromise();
      const fetchedBranches: string[] = branchResult.data?.repoBranches ?? [];
      setBranches(fetchedBranches);

      if (fetchedBranches.length > 0) {
        const defaultBranch = fetchedBranches.includes('main')
          ? 'main'
          : fetchedBranches.includes('master')
            ? 'master'
            : fetchedBranches[0];
        setBaseBranch(defaultBranch);
      }
    } catch {
      setRepoValid(false);
      setError('Failed to validate path');
      setLocalRepoPath('');
    } finally {
      setValidating(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setCreating(true);
    setError(null);
    try {
      const result = await executeCreateChannel({
        name: trimmedName,
        serverId,
        githubUrl: detectedOriginUrl,
        baseBranch: baseBranch.trim() || 'main',
      });

      if (result.error) {
        setError(result.error.message || 'Failed to create channel');
        return;
      }

      const channel = result.data.createChannel;

      // Save local config
      if (localRepoPath) {
        await onLocalConfigSave(channel.id, { localRepoPath });
      }

      onCreated();
    } catch {
      setError('Failed to create channel');
    } finally {
      setCreating(false);
    }
  }, [name, serverId, localRepoPath, baseBranch, detectedOriginUrl, onCreated, onLocalConfigSave, executeCreateChannel]);

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
            <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Repository</label>
            {localRepoPath && repoValid ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#565f89]">
                  {localRepoPath}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLocalRepoPath('');
                    setRepoValid(null);
                    setDetectedOriginUrl(null);
                    setBranches([]);
                    setBaseBranch('main');
                    setError(null);
                  }}
                  className="shrink-0 rounded px-2 py-1.5 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5]"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSelectFolder()}
                disabled={validating}
                className="w-full rounded border border-dashed border-[#292e42] bg-[#16161e] px-3 py-3 text-sm text-[#565f89] hover:border-[#7aa2f7] hover:text-[#c0caf5] disabled:opacity-50"
              >
                {validating ? 'Validating...' : 'Select Folder'}
              </button>
            )}
            {repoValid === true && detectedOriginUrl && (
              <p className="mt-1 text-[10px] text-[#9ece6a]">
                Origin: <span className="text-[#565f89]">{detectedOriginUrl}</span>
              </p>
            )}
            {repoValid === false && error && (
              <p className="mt-1 text-[10px] text-[#f7768e]">{error}</p>
            )}
          </div>

          {repoValid && branches.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Base Branch</label>
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] outline-none focus:border-[#7aa2f7]"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-[#3b4261]">Branch to merge worktrees into</p>
            </div>
          )}

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
