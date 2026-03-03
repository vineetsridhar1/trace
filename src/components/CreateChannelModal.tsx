import { useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { FiX, FiZap } from 'react-icons/fi';
import type { Channel, ChannelType, LocalChannelConfig } from '../types';
import {
  useCreateChannelMutation,
} from './__generated__/CreateChannelModal.generated';

const GQL_CREATE_CHANNEL = gql`
  mutation CreateChannel($name: String!, $serverId: String, $type: String, $workspacesEnabled: Boolean, $teamIds: [String!], $githubUrl: String, $baseBranch: String, $defaultSetupScript: String, $defaultRunScript: String) {
    createChannel(name: $name, serverId: $serverId, type: $type, workspacesEnabled: $workspacesEnabled, teamIds: $teamIds, githubUrl: $githubUrl, baseBranch: $baseBranch, defaultSetupScript: $defaultSetupScript, defaultRunScript: $defaultRunScript) {
      id
      serverId
      name
      type
      workspacesEnabled
      teamIds
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
  channelType: ChannelType;
  teams: Channel[];
  onClose: () => void;
  onCreated: () => void;
  onLocalConfigSave: (channelId: string, data: LocalChannelConfig) => Promise<void>;
}

export function CreateChannelModal({ serverId, channelType, teams, onClose, onCreated, onLocalConfigSave }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teamsDropdownOpen, setTeamsDropdownOpen] = useState(false);
  const [workspacesEnabled, setWorkspacesEnabled] = useState(false);
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
      return;
    }
    setSuggesting(true);
    try {
      const result = await window.traceAPI.suggestScripts(localRepoPath);
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
          type: channelType,
          workspacesEnabled,
          teamIds: selectedTeamIds.length > 0 ? selectedTeamIds : undefined,
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
  }, [name, serverId, channelType, workspacesEnabled, selectedTeamIds, localRepoPath, baseBranch, defaultSetupScript, defaultRunScript, mySetupScript, myRunScript, mySystemInstructions, detectedOriginUrl, onCreated, onLocalConfigSave, executeCreateChannel]);

  const textareaClass = 'w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-accent resize-none font-mono';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Create {channelType === 'team' ? 'Team' : channelType === 'channel' ? 'Channel' : 'Project'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary">
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-primary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={channelType === 'team' ? 'my-team' : channelType === 'channel' ? 'general' : 'my-project'}
              autoFocus
              className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-accent"
            />
          </div>

          {/* Associated Teams (projects only) */}
          {channelType === 'project' && (
            <div className="relative">
              <label className="mb-1.5 block text-xs font-medium text-primary">Teams</label>
              {teams.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setTeamsDropdownOpen((o) => !o)}
                    className="flex w-full items-center justify-between rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary outline-none focus:border-accent"
                  >
                    <span className={selectedTeamIds.length === 0 ? 'text-[#404040]' : ''}>
                      {selectedTeamIds.length === 0
                        ? 'Select teams...'
                        : teams
                            .filter((t) => selectedTeamIds.includes(t.id))
                            .map((t) => `# ${t.name}`)
                            .join(', ')}
                    </span>
                    <svg className={`h-3 w-3 text-muted transition-transform ${teamsDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5" /></svg>
                  </button>
                  {teamsDropdownOpen && (
                    <div className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded border border-edge bg-surface-deep py-1 shadow-lg">
                      {teams.map((team) => {
                        const selected = selectedTeamIds.includes(team.id);
                        return (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() =>
                              setSelectedTeamIds((prev) =>
                                selected ? prev.filter((id) => id !== team.id) : [...prev, team.id],
                              )
                            }
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-primary hover:bg-surface-elevated"
                          >
                            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                              selected ? 'border-accent bg-accent' : 'border-muted'
                            }`}>
                              {selected && (
                                <svg className="h-2.5 w-2.5 text-on-accent" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6L5 8.5L9.5 3.5" /></svg>
                              )}
                            </span>
                            <span># {team.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs italic text-muted">No teams yet — create a team first to associate it</p>
              )}
              <p className="mt-1.5 text-xs text-muted">Optional — associate this project with one or more teams</p>
            </div>
          )}

          {/* Enable Workspaces toggle (hidden for chat-only channels) */}
          {channelType !== 'channel' && (<>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-primary">Enable Workspaces</label>
              <p className="text-xs text-muted">Link a repo to run code in isolated worktrees</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !workspacesEnabled;
                setWorkspacesEnabled(next);
                if (!next) {
                  setLocalRepoPath('');
                  setRepoValid(null);
                  setDetectedOriginUrl(null);
                  setBranches([]);
                  setBaseBranch('main');
                  setDefaultSetupScript('');
                  setDefaultRunScript('');
                  setMySetupScript('');
                  setMyRunScript('');
                  setMySystemInstructions('');
                  setError(null);
                }
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                workspacesEnabled ? 'bg-accent' : 'bg-surface-elevated'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  workspacesEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {workspacesEnabled && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-primary">Repository</label>
                {localRepoPath && repoValid ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-muted">
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
                      className="shrink-0 rounded px-2 py-1.5 text-xs text-muted hover:bg-surface-elevated hover:text-primary"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSelectFolder()}
                    disabled={validating}
                    className="w-full rounded border border-dashed border-edge bg-surface-deep px-3 py-3 text-sm text-muted hover:border-accent hover:text-primary disabled:opacity-50"
                  >
                    {validating ? 'Validating...' : 'Select Folder'}
                  </button>
                )}
                {repoValid === true && detectedOriginUrl && (
                  <p className="mt-1 text-xs text-green-400">
                    Origin: <span className="text-muted">{detectedOriginUrl}</span>
                  </p>
                )}
                {repoValid === false && error && (
                  <p className="mt-1 text-xs text-red-400">{error}</p>
                )}
              </div>

              {repoValid && branches.length > 0 && (
                <div className="relative">
                  <label className="mb-1.5 block text-xs font-medium text-primary">Base Branch</label>
                  <input
                    type="text"
                    value={baseBranch}
                    onChange={(e) => setBaseBranch(e.target.value)}
                    list="branch-options"
                    placeholder="e.g. main"
                    className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-accent"
                  />
                  <datalist id="branch-options">
                    {branches.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-muted">Branch to merge worktrees into</p>
                </div>
              )}

              {repoValid && (
                <>
                  {/* Environment Variables (read-only reference) */}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-primary">Available environment variables</p>
                    <div className="rounded border border-edge bg-surface-deep px-3 py-2 space-y-0.5 text-xs text-muted">
                      <p><code className="text-green-400">$PORT</code> — primary port (same as $TRACE_PORT_0)</p>
                      <p><code className="text-green-400">$TRACE_PORT_0</code> – <code className="text-green-400">$TRACE_PORT_9</code> — 10 allocated ports</p>
                      <p><code className="text-green-400">$REPO_FOLDER</code> — worktree directory path</p>
                    </div>
                  </div>

                  {/* ═══ Channel Settings ═══ */}
                  <div className="border-t border-edge pt-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">Channel Settings</h3>

                    {/* Default Setup Script */}
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <label className="text-xs font-medium text-primary">Default Setup Script</label>
                          <p className="text-xs text-muted">Runs when a new workspace is created</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSuggestScripts()}
                          disabled={suggesting}
                          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-accent hover:bg-surface-elevated disabled:opacity-50"
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
                        <label className="text-xs font-medium text-primary">Default Run Script</label>
                        <p className="text-xs text-muted">Runs when you click the play button</p>
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
                  <div className="border-t border-edge pt-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">My Settings</h3>

                    {/* Setup Script Override */}
                    <div className="mb-4">
                      <div className="mb-2">
                        <label className="text-xs font-medium text-primary">Setup Script Override</label>
                        <p className="text-xs text-muted">Runs when a new workspace is created and will override the default setup script</p>
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
                        <label className="text-xs font-medium text-primary">Run Script Override</label>
                        <p className="text-xs text-muted">Runs when you click the play button and will override the default run script</p>
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
                        <label className="text-xs font-medium text-primary">System Instructions</label>
                        <p className="text-xs text-muted">Injected as hidden context into every new task</p>
                      </div>
                      <textarea
                        value={mySystemInstructions}
                        onChange={(e) => setMySystemInstructions(e.target.value)}
                        placeholder={"e.g. This is a TypeScript monorepo. Always run tests with `npm test` from the root."}
                        rows={3}
                        style={{ fieldSizing: 'content' } as React.CSSProperties}
                        className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-accent resize-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          </>)}

          {error && repoValid !== false && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost rounded px-3 py-1.5 text-xs text-muted hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium text-on-accent"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
