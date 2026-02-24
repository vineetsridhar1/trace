import { useState, useEffect, useCallback } from 'react';
import { FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { Channel, LocalChannelConfig } from '../types';

interface DraftScript {
  name: string;
  command: string;
}

interface ChannelSettingsModalProps {
  channel: Channel;
  localConfig: LocalChannelConfig | null;
  onClose: () => void;
  onSave: (baseBranch: string | null, localConfig: LocalChannelConfig | null) => Promise<void>;
}

export function ChannelSettingsModal({ channel, localConfig, onClose, onSave }: ChannelSettingsModalProps) {
  const [draftBaseBranch, setDraftBaseBranch] = useState(channel.baseBranch ?? 'main');
  const [draftCreationScript, setDraftCreationScript] = useState(localConfig?.creationScript ?? '');
  const [draftScripts, setDraftScripts] = useState<DraftScript[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftBaseBranch(channel.baseBranch ?? 'main');
    setDraftCreationScript(localConfig?.creationScript ?? '');
    setDraftScripts(
      localConfig?.startupScripts?.map((s) => ({ name: s.name, command: s.command })) ?? [],
    );
  }, [channel, localConfig]);

  const addDraftScript = useCallback(() => {
    setDraftScripts((prev) => [...prev, { name: '', command: '' }]);
  }, []);

  const removeDraftScript = useCallback((index: number) => {
    setDraftScripts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateDraftScript = useCallback((index: number, field: 'name' | 'command', value: string) => {
    setDraftScripts((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const repoPath = localConfig?.localRepoPath;
      let updatedLocalConfig: LocalChannelConfig | null = null;

      if (repoPath) {
        const filteredScripts = draftScripts.filter((s) => s.name.trim() || s.command.trim());
        updatedLocalConfig = {
          localRepoPath: repoPath,
          creationScript: draftCreationScript.trim() || undefined,
          startupScripts: filteredScripts.length > 0 ? filteredScripts : undefined,
        };
      }

      await onSave(
        draftBaseBranch.trim() || null,
        updatedLocalConfig,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }, [draftBaseBranch, draftCreationScript, draftScripts, localConfig, onSave, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-[#292e42] bg-[#1a1b26] shadow-xl"
        onClick={(e) => e.stopPropagation()}
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
          {/* Local Repo Path (read-only) */}
          {localConfig?.localRepoPath && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Local Repo Path</label>
              <div className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#565f89]">
                {localConfig.localRepoPath}
              </div>
              {channel.githubUrl && (
                <p className="mt-1 text-[10px] text-[#565f89]">Origin: {channel.githubUrl}</p>
              )}
            </div>
          )}

          {/* Base Branch */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Base Branch</label>
            <input
              type="text"
              value={draftBaseBranch}
              onChange={(e) => setDraftBaseBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
            />
            <p className="mt-1 text-[10px] text-[#3b4261]">Branch to merge worktrees into</p>
          </div>

          {/* Creation Script */}
          <div>
            <div className="mb-2">
              <label className="text-xs font-medium text-[#565f89]">Creation Script</label>
              <p className="text-[10px] text-[#3b4261]">Run once when a worktree is created (e.g. copy .env, npm install)</p>
            </div>
            <textarea
              value={draftCreationScript}
              onChange={(e) => setDraftCreationScript(e.target.value)}
              placeholder={'cp ../.env .env\nnpm install'}
              rows={3}
              style={{ fieldSizing: 'content' } as React.CSSProperties}
              className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7] resize-none font-mono"
            />
          </div>

          {/* Startup Scripts */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-[#565f89]">Startup Scripts</label>
                <p className="text-[10px] text-[#3b4261]">Run each time to start servers (e.g. npm run dev)</p>
              </div>
              <button
                type="button"
                onClick={addDraftScript}
                className="rounded px-2 py-0.5 text-xs text-[#7aa2f7] hover:bg-[#292e42]"
              >
                + Add
              </button>
            </div>

            {draftScripts.length === 0 && (
              <p className="text-xs text-[#3b4261]">No startup scripts configured.</p>
            )}

            <div className="space-y-2">
              {draftScripts.map((script, index) => (
                <div key={`script-${index}`} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={script.name}
                    onChange={(e) => updateDraftScript(index, 'name', e.target.value)}
                    placeholder="Name"
                    className="w-28 shrink-0 rounded border border-[#292e42] bg-[#16161e] px-2 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
                  />
                  <textarea
                    value={script.command}
                    onChange={(e) => updateDraftScript(index, 'command', e.target.value)}
                    placeholder="e.g. npm run dev"
                    rows={1}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className="min-w-0 flex-1 rounded border border-[#292e42] bg-[#16161e] px-2 py-1.5 text-xs text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7] resize-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftScript(index)}
                    className="shrink-0 rounded p-1.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#f7768e]"
                  >
                    <FiX className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
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
