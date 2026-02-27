import { useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { FiX, FiZap } from 'react-icons/fi';
import type { LocalChannelConfig } from '../types';
import {
  useCreateChannelMutation,
} from './__generated__/CreateChannelModal.generated';

const GQL_CREATE_CHANNEL = gql`
  mutation CreateChannel($name: String!, $serverId: String, $githubUrl: String, $baseBranch: String, $defaultSetupScript: String, $defaultRunScript: String) {
    createChannel(name: $name, serverId: $serverId, githubUrl: $githubUrl, baseBranch: $baseBranch, defaultSetupScript: $defaultSetupScript, defaultRunScript: $defaultRunScript) {
      id
      serverId
      name
      baseBranch
      githubUrl
      defaultSetupScript
      defaultRunScript
      createdAt
      updatedAt
    }
  }
`;

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
  const [defaultSetupScript, setDefaultSetupScript] = useState('');
  const [defaultRunScript, setDefaultRunScript] = useState('');
  const [mySetupScript, setMySetupScript] = useState('');
  const [myRunScript, setMyRunScript] = useState('');
  const [mySystemInstructions, setMySystemInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [repoValid, setRepoValid] = useState<boolean | null>(null);
  const [detectedOriginUrl, setDetectedOriginUrl] = useState<string | null>(null);
  const [executeCreateChannel] = useCreateChannelMutation();

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
      const validateResult = await window.traceAPI.validateRepo(selectedPath);

      if (!validateResult.valid) {
        setRepoValid(false);
        setError(validateResult.error ?? 'Invalid repository');
        setLocalRepoPath('');
        return;
      }

      setRepoValid(true);
      setDetectedOriginUrl(validateResult.originUrl ?? null);

      // Fetch branches
      const branchResult = await window.traceAPI.listRepoBranches(selectedPath);
      const fetchedBranches: string[] = branchResult.success ? branchResult.branches : [];
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

  const handleSuggestScripts = useCallback(async () => {
    if (!localRepoPath) {
      console.warn('[SuggestScripts] No localRepoPath');
      return;
    }
    console.log('[SuggestScripts] Calling suggestScripts with', localRepoPath);
    setSuggesting(true);
    try {
      const result = await window.traceAPI.suggestScripts(localRepoPath);
      console.log('[SuggestScripts] Result:', result);
      if (result.success) {
        if (result.setupScript) setDefaultSetupScript(result.setupScript);
        if (result.runScript) setDefaultRunScript(result.runScript);
      }
    } catch (err) {
      console.error('[SuggestScripts] Error:', err);
    } finally {
      setSuggesting(false);
    }
  }, [localRepoPath]);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setCreating(true);
    setError(null);
    try {
      const { data, errors } = await executeCreateChannel({
        variables: {
          name: trimmedName,
          serverId,
          githubUrl: detectedOriginUrl,
          baseBranch: baseBranch.trim() || 'main',
          defaultSetupScript: defaultSetupScript.trim() || null,
          defaultRunScript: defaultRunScript.trim() || null,
        },
      });

      if (errors?.length) {
        setError(errors[0].message || 'Failed to create channel');
        return;
      }

      const channel = data!.createChannel;

      // Save local config with user overrides
      if (localRepoPath) {
        await onLocalConfigSave(channel.id, {
          localRepoPath,
          setupScript: mySetupScript.trim() || undefined,
          runScript: myRunScript.trim() || undefined,
          systemInstructions: mySystemInstructions.trim() || undefined,
        });
      }

      onCreated();
    } catch {
      setError('Failed to create channel');
    } finally {
      setCreating(false);
    }
  }, [name, serverId, localRepoPath, baseBranch, defaultSetupScript, defaultRunScript, mySetupScript, myRunScript, mySystemInstructions, detectedOriginUrl, onCreated, onLocalConfigSave, executeCreateChannel]);

  const textareaClass = 'w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7] resize-none font-mono';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-[#292e42] bg-[#1a1b26] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[#292e42] px-5 py-3">
          <h2 className="text-sm font-semibold text-[#c0caf5]">Create Channel</h2>
          <button type="button" onClick={onClose} className="text-[#565f89] hover:text-[#c0caf5]">
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Name</label>
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
            <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Repository</label>
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
                    setDefaultSetupScript('');
                    setDefaultRunScript('');
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
              <p className="mt-1 text-xs text-[#9ece6a]">
                Origin: <span className="text-[#565f89]">{detectedOriginUrl}</span>
              </p>
            )}
            {repoValid === false && error && (
              <p className="mt-1 text-xs text-[#f7768e]">{error}</p>
            )}
          </div>

          {repoValid && branches.length > 0 && (
            <div className="relative">
              <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Base Branch</label>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                list="branch-options"
                placeholder="e.g. main"
                className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
              />
              <datalist id="branch-options">
                {branches.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-[#565f89]">Branch to merge worktrees into</p>
            </div>
          )}

          {repoValid && (
            <>
              {/* Environment Variables (read-only reference) */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-[#a9b1d6]">Available environment variables</p>
                <div className="rounded border border-[#292e42] bg-[#16161e] px-3 py-2 space-y-0.5 text-xs text-[#565f89]">
                  <p><code className="text-[#9ece6a]">$PORT</code> — primary port (same as $TRACE_PORT_0)</p>
                  <p><code className="text-[#9ece6a]">$TRACE_PORT_0</code> – <code className="text-[#9ece6a]">$TRACE_PORT_9</code> — 10 allocated ports</p>
                  <p><code className="text-[#9ece6a]">$REPO_FOLDER</code> — worktree directory path</p>
                </div>
              </div>

              {/* ═══ Channel Settings ═══ */}
              <div className="border-t border-[#292e42] pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7aa2f7]">Channel Settings</h3>

                {/* Default Setup Script */}
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <label className="text-xs font-medium text-[#a9b1d6]">Default Setup Script</label>
                      <p className="text-xs text-[#565f89]">Runs when a new workspace is created</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSuggestScripts()}
                      disabled={suggesting}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-[#7aa2f7] hover:bg-[#292e42] disabled:opacity-50"
                    >
                      <FiZap className="h-3 w-3" aria-hidden="true" />
                      {suggesting ? 'Detecting...' : 'Suggest Scripts'}
                    </button>
                  </div>
                  <textarea
                    value={defaultSetupScript}
                    onChange={(e) => setDefaultSetupScript(e.target.value)}
                    placeholder={'e.g. cp ../.env .env\nnpm install'}
                    rows={3}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className={textareaClass}
                  />
                </div>

                {/* Default Run Script */}
                <div>
                  <div className="mb-2">
                    <label className="text-xs font-medium text-[#a9b1d6]">Default Run Script</label>
                    <p className="text-xs text-[#565f89]">Runs when you click the play button</p>
                  </div>
                  <textarea
                    value={defaultRunScript}
                    onChange={(e) => setDefaultRunScript(e.target.value)}
                    placeholder={'e.g. npm run dev'}
                    rows={2}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className={textareaClass}
                  />
                </div>
              </div>

              {/* ═══ My Settings ═══ */}
              <div className="border-t border-[#292e42] pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7aa2f7]">My Settings</h3>

                {/* Setup Script Override */}
                <div className="mb-4">
                  <div className="mb-2">
                    <label className="text-xs font-medium text-[#a9b1d6]">Setup Script Override</label>
                    <p className="text-xs text-[#565f89]">Runs when a new workspace is created and will override the default setup script</p>
                  </div>
                  <textarea
                    value={mySetupScript}
                    onChange={(e) => setMySetupScript(e.target.value)}
                    placeholder={defaultSetupScript || 'e.g. cp ../.env .env\nnpm install'}
                    rows={3}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className={textareaClass}
                  />
                </div>

                {/* Run Script Override */}
                <div className="mb-4">
                  <div className="mb-2">
                    <label className="text-xs font-medium text-[#a9b1d6]">Run Script Override</label>
                    <p className="text-xs text-[#565f89]">Runs when you click the play button and will override the default run script</p>
                  </div>
                  <textarea
                    value={myRunScript}
                    onChange={(e) => setMyRunScript(e.target.value)}
                    placeholder={defaultRunScript || 'e.g. npm run dev'}
                    rows={2}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className={textareaClass}
                  />
                </div>

                {/* System Instructions */}
                <div>
                  <div className="mb-2">
                    <label className="text-xs font-medium text-[#a9b1d6]">System Instructions</label>
                    <p className="text-xs text-[#565f89]">Injected as hidden context into every new task</p>
                  </div>
                  <textarea
                    value={mySystemInstructions}
                    onChange={(e) => setMySystemInstructions(e.target.value)}
                    placeholder={"e.g. This is a TypeScript monorepo. Always run tests with `npm test` from the root."}
                    rows={3}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7] resize-none"
                  />
                </div>
              </div>
            </>
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
