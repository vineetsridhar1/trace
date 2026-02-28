import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiExternalLink, FiTrash2, FiX, FiZap } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { Channel, LocalChannelConfig } from '../types';

interface ChannelSettingsModalProps {
  channel: Channel;
  teams: Channel[];
  localConfig: LocalChannelConfig | null;
  onClose: () => void;
  onSave: (
    channelData: {
      name?: string;
      workspacesEnabled?: boolean;
      teamIds?: string[];
      defaultSetupScript?: string | null;
      defaultRunScript?: string | null;
    },
    localConfig: LocalChannelConfig | null,
  ) => Promise<void>;
  onDelete?: (channelId: string) => Promise<void>;
}

export function ChannelSettingsModal({ channel, teams, localConfig, onClose, onSave, onDelete }: ChannelSettingsModalProps) {
  // Channel settings
  const [draftName, setDraftName] = useState(channel.name);
  const [draftWorkspacesEnabled, setDraftWorkspacesEnabled] = useState(channel.workspacesEnabled);
  const [draftTeamIds, setDraftTeamIds] = useState<string[]>(channel.teamIds ?? []);
  const [teamsDropdownOpen, setTeamsDropdownOpen] = useState(false);
  const [draftDefaultSetupScript, setDraftDefaultSetupScript] = useState(channel.defaultSetupScript ?? '');
  const [draftDefaultRunScript, setDraftDefaultRunScript] = useState(channel.defaultRunScript ?? '');

  // User settings (local config)
  const [draftLocalRepoPath, setDraftLocalRepoPath] = useState(localConfig?.localRepoPath ?? '');
  const [draftSetupScript, setDraftSetupScript] = useState(localConfig?.setupScript ?? '');
  const [draftRunScript, setDraftRunScript] = useState(localConfig?.runScript ?? '');
  const [draftSystemInstructions, setDraftSystemInstructions] = useState(localConfig?.systemInstructions ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(channel.name);
    setDraftWorkspacesEnabled(channel.workspacesEnabled);
    setDraftTeamIds(channel.teamIds ?? []);
    setDraftDefaultSetupScript(channel.defaultSetupScript ?? '');
    setDraftDefaultRunScript(channel.defaultRunScript ?? '');
    setDraftLocalRepoPath(localConfig?.localRepoPath ?? '');
    setDraftSetupScript(localConfig?.setupScript ?? '');
    setDraftRunScript(localConfig?.runScript ?? '');
    setDraftSystemInstructions(localConfig?.systemInstructions ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  const repoPath = draftLocalRepoPath || channel.localRepoPath || null;

  const handleSelectFolder = useCallback(async () => {
    const result = await window.traceAPI.selectFolder();
    if (!result.success || result.canceled || !result.path) return;

    const selectedPath = result.path;
    setRepoError(null);
    setValidating(true);

    try {
      const validateResult = await window.traceAPI.validateRepo(selectedPath);
      if (!validateResult.valid) {
        setRepoError(validateResult.error ?? 'Invalid repository');
        return;
      }
      setDraftLocalRepoPath(selectedPath);
    } catch {
      setRepoError('Failed to validate path');
    } finally {
      setValidating(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const channelData: {
        name?: string;
        workspacesEnabled?: boolean;
        teamIds?: string[];
        defaultSetupScript?: string | null;
        defaultRunScript?: string | null;
      } = {
        name: draftName.trim() || undefined,
        workspacesEnabled: draftWorkspacesEnabled,
        defaultSetupScript: draftDefaultSetupScript.trim() || null,
        defaultRunScript: draftDefaultRunScript.trim() || null,
      };
      if (channel.type === 'project') {
        channelData.teamIds = draftTeamIds;
      }

      let updatedLocalConfig: LocalChannelConfig | null = null;
      if (draftLocalRepoPath) {
        updatedLocalConfig = {
          localRepoPath: draftLocalRepoPath,
          setupScript: draftSetupScript.trim() || undefined,
          runScript: draftRunScript.trim() || undefined,
          systemInstructions: draftSystemInstructions.trim() || undefined,
        };
      }

      await onSave(channelData, updatedLocalConfig);
      onClose();
    } catch (err) {
      console.error('[ChannelSettingsModal] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [channel.type, draftName, draftWorkspacesEnabled, draftTeamIds, draftDefaultSetupScript, draftDefaultRunScript, draftLocalRepoPath, draftSetupScript, draftRunScript, draftSystemInstructions, onSave, onClose]);

  const handleSuggestScripts = useCallback(async () => {
    if (!repoPath) return;
    setSuggesting(true);
    try {
      const result = await window.traceAPI.suggestScripts(repoPath);
      if (result.success) {
        if (result.setupScript) setDraftDefaultSetupScript(result.setupScript);
        if (result.runScript) setDraftDefaultRunScript(result.runScript);
      }
    } catch (err) {
      console.error('[SuggestScripts] Error:', err);
    } finally {
      setSuggesting(false);
    }
  }, [repoPath]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(channel.id);
    } catch (err) {
      console.error('[ChannelSettingsModal] Delete failed:', err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [channel.id, onDelete]);

  const textareaClass = 'w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7] resize-none font-mono';

  const typeLabel = channel.type === 'team' ? 'Team' : channel.type === 'project' ? 'Project' : 'Channel';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-[#292e42] bg-[#1a1b26] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[#292e42] px-5 py-3">
          <h2 className="text-sm font-semibold text-[#c0caf5]">{typeLabel} Settings — #{channel.name}</h2>
          <Tooltip text="Close" position="bottom">
            <button type="button" onClick={onClose} className="text-[#565f89] hover:text-[#c0caf5]">
              <FiX className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* ═══ General Settings ═══ */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7aa2f7]">{typeLabel} Settings</h3>

            {/* Name */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Name</label>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
              />
            </div>

            {/* Associated Teams (projects only) */}
            {channel.type === 'project' && (
              <div className="relative mb-4">
                <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Teams</label>
                {teams.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setTeamsDropdownOpen((o) => !o)}
                      className="flex w-full items-center justify-between rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] outline-none focus:border-[#7aa2f7]"
                    >
                      <span className={draftTeamIds.length === 0 ? 'text-[#3b4261]' : ''}>
                        {draftTeamIds.length === 0
                          ? 'Select teams...'
                          : teams
                              .filter((t) => draftTeamIds.includes(t.id))
                              .map((t) => `# ${t.name}`)
                              .join(', ')}
                      </span>
                      <svg className={`h-3 w-3 text-[#565f89] transition-transform ${teamsDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5" /></svg>
                    </button>
                    {teamsDropdownOpen && (
                      <div className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded border border-[#292e42] bg-[#16161e] py-1 shadow-lg">
                        {teams.map((team) => {
                          const selected = draftTeamIds.includes(team.id);
                          return (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() =>
                                setDraftTeamIds((prev) =>
                                  selected ? prev.filter((tid) => tid !== team.id) : [...prev, team.id],
                                )
                              }
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#a9b1d6] hover:bg-[#292e42]"
                            >
                              <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                selected ? 'border-[#7aa2f7] bg-[#7aa2f7]' : 'border-[#565f89]'
                              }`}>
                                {selected && (
                                  <svg className="h-2.5 w-2.5 text-[#1a1b26]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6L5 8.5L9.5 3.5" /></svg>
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
                  <p className="text-xs italic text-[#565f89]">No teams yet — create a team first to associate it</p>
                )}
                <p className="mt-1.5 text-xs text-[#565f89]">Optional — associate this project with one or more teams</p>
              </div>
            )}

            {/* Workspaces toggle (hidden for chat-only channels) */}
            {channel.type !== 'channel' && (<>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-[#a9b1d6]">Enable Workspaces</label>
                <p className="text-xs text-[#565f89]">Link a repo to run code in isolated worktrees</p>
              </div>
              <button
                type="button"
                onClick={() => setDraftWorkspacesEnabled(!draftWorkspacesEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  draftWorkspacesEnabled ? 'bg-[#7aa2f7]' : 'bg-[#292e42]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    draftWorkspacesEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Repository section — only when workspaces enabled */}
            {draftWorkspacesEnabled && (
              <>
                {/* Repository path */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Repository</label>
                  {repoPath ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#565f89] truncate">
                        {repoPath}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftLocalRepoPath('');
                          setRepoError(null);
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
                  {repoError && (
                    <p className="mt-1 text-xs text-[#f7768e]">{repoError}</p>
                  )}
                </div>

                {/* GitHub link (read-only) */}
                {channel.githubUrl && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">GitHub</label>
                    <a
                      href={channel.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[#7aa2f7] hover:underline"
                    >
                      {channel.githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                      <FiExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                )}

                {/* Everything below only shown when a repo is linked */}
                {repoPath && (
                  <>
                    {/* Base Branch (read-only) */}
                    <div className="mb-4">
                      <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Base Branch</label>
                      <div className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#565f89]">
                        {channel.baseBranch || 'main'}
                      </div>
                    </div>

                    {/* Environment Variables (read-only reference) */}
                    <div className="mb-4">
                      <p className="mb-1.5 text-xs font-medium text-[#a9b1d6]">Available environment variables</p>
                      <div className="rounded border border-[#292e42] bg-[#16161e] px-3 py-2 space-y-0.5 text-xs text-[#565f89]">
                        <p><code className="text-[#9ece6a]">$PORT</code> — primary port (same as $TRACE_PORT_0)</p>
                        <p><code className="text-[#9ece6a]">$TRACE_PORT_0</code> – <code className="text-[#9ece6a]">$TRACE_PORT_9</code> — 10 allocated ports</p>
                        <p><code className="text-[#9ece6a]">$REPO_FOLDER</code> — worktree directory path</p>
                      </div>
                    </div>

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
                        value={draftDefaultSetupScript}
                        onChange={(e) => setDraftDefaultSetupScript(e.target.value)}
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
                        value={draftDefaultRunScript}
                        onChange={(e) => setDraftDefaultRunScript(e.target.value)}
                        placeholder={'e.g. npm run dev'}
                        rows={2}
                        style={{ fieldSizing: 'content' } as React.CSSProperties}
                        className={textareaClass}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </>)}
          </div>

          {/* ═══ My Settings ═══ (only when repo linked) */}
          {channel.type !== 'channel' && draftWorkspacesEnabled && repoPath && (
            <>
              <div className="border-t border-[#292e42]" />
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7aa2f7]">My Settings</h3>

                {/* Local Repo Path (read-only) */}
                {localConfig?.localRepoPath && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Local Repo Path</label>
                    <div className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#565f89]">
                      {localConfig.localRepoPath}
                    </div>
                  </div>
                )}

                {/* Setup Script Override */}
                <div className="mb-4">
                  <div className="mb-2">
                    <label className="text-xs font-medium text-[#a9b1d6]">Setup Script Override</label>
                    <p className="text-xs text-[#565f89]">Runs when a new workspace is created and will override the default setup script</p>
                  </div>
                  <textarea
                    value={draftSetupScript}
                    onChange={(e) => setDraftSetupScript(e.target.value)}
                    placeholder={channel.defaultSetupScript || 'e.g. cp ../.env .env\nnpm install'}
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
                    value={draftRunScript}
                    onChange={(e) => setDraftRunScript(e.target.value)}
                    placeholder={channel.defaultRunScript || 'e.g. npm run dev'}
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
                    value={draftSystemInstructions}
                    onChange={(e) => setDraftSystemInstructions(e.target.value)}
                    placeholder={"e.g. This is a TypeScript monorepo. Always run tests with `npm test` from the root."}
                    rows={3}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7] resize-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center border-t border-[#292e42] px-5 py-3">
          {onDelete && (
            <div className="flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-[#f7768e]">Delete this {typeLabel.toLowerCase()}?</span>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="rounded bg-[#f7768e] px-2.5 py-1 text-xs font-medium text-[#1a1b26] hover:bg-[#ff9e9e] disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  {!deleting && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded px-2 py-1 text-xs text-[#565f89] hover:text-[#c0caf5]"
                    >
                      Cancel
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#f7768e]"
                >
                  <FiTrash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded bg-[#7aa2f7] px-3 py-1.5 text-xs font-medium text-[#1a1b26] hover:bg-[#89b4fa] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
