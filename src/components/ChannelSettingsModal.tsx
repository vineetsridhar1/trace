import { useState, useEffect, useCallback } from 'react';
import { FiExternalLink, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { Channel, LocalChannelConfig } from '../types';

interface ChannelSettingsModalProps {
  channel: Channel;
  localConfig: LocalChannelConfig | null;
  onClose: () => void;
  onSave: (
    channelData: {
      defaultSetupScript?: string | null;
      defaultRunScript?: string | null;
    },
    localConfig: LocalChannelConfig | null,
  ) => Promise<void>;
}

export function ChannelSettingsModal({ channel, localConfig, onClose, onSave }: ChannelSettingsModalProps) {
  // Channel settings
  const [draftDefaultSetupScript, setDraftDefaultSetupScript] = useState(channel.defaultSetupScript ?? '');
  const [draftDefaultRunScript, setDraftDefaultRunScript] = useState(channel.defaultRunScript ?? '');

  // User settings (local config)
  const [draftSetupScript, setDraftSetupScript] = useState(localConfig?.setupScript ?? '');
  const [draftRunScript, setDraftRunScript] = useState(localConfig?.runScript ?? '');
  const [draftSystemInstructions, setDraftSystemInstructions] = useState(localConfig?.systemInstructions ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftDefaultSetupScript(channel.defaultSetupScript ?? '');
    setDraftDefaultRunScript(channel.defaultRunScript ?? '');
    setDraftSetupScript(localConfig?.setupScript ?? '');
    setDraftRunScript(localConfig?.runScript ?? '');
    setDraftSystemInstructions(localConfig?.systemInstructions ?? '');
  }, [channel, localConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const channelData = {
        defaultSetupScript: draftDefaultSetupScript.trim() || null,
        defaultRunScript: draftDefaultRunScript.trim() || null,
      };

      const repoPath = localConfig?.localRepoPath;
      let updatedLocalConfig: LocalChannelConfig | null = null;
      if (repoPath) {
        updatedLocalConfig = {
          localRepoPath: repoPath,
          setupScript: draftSetupScript.trim() || undefined,
          runScript: draftRunScript.trim() || undefined,
          systemInstructions: draftSystemInstructions.trim() || undefined,
        };
      }

      await onSave(channelData, updatedLocalConfig);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [draftDefaultSetupScript, draftDefaultRunScript, draftSetupScript, draftRunScript, draftSystemInstructions, localConfig, onSave, onClose]);

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
          <h2 className="text-sm font-semibold text-[#c0caf5]">Channel Settings — #{channel.name}</h2>
          <Tooltip text="Close" position="bottom">
            <button type="button" onClick={onClose} className="text-[#565f89] hover:text-[#c0caf5]">
              <FiX className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* ═══ Channel Settings ═══ */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7aa2f7]">Channel Settings</h3>

            {/* Repository (read-only GitHub link) */}
            {channel.githubUrl && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-[#a9b1d6]">Repository</label>
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

            {/* Base Branch (read-only, set at creation) */}
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
              <div className="mb-2">
                <label className="text-xs font-medium text-[#a9b1d6]">Default Setup Script</label>
                <p className="text-xs text-[#565f89]">Runs when a new workspace is created</p>
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
          </div>

          <div className="border-t border-[#292e42]" />

          {/* ═══ My Settings ═══ */}
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
        </div>

        {/* Footer */}
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
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded bg-[#7aa2f7] px-3 py-1.5 text-xs font-medium text-[#1a1b26] hover:bg-[#89b4fa] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
