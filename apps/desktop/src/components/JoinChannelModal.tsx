import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { gitUrlsMatch } from '../utils/gitUrl';
import type { Channel, LocalChannelConfig } from '../types';

interface JoinChannelModalProps {
  channel: Channel;
  onJoined: (config: LocalChannelConfig) => void;
  onCancel: () => void;
}

export function JoinChannelModal({ channel, onJoined, onCancel }: JoinChannelModalProps) {
  const [localRepoPath, setLocalRepoPath] = useState('');
  const [validating, setValidating] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [urlMatch, setUrlMatch] = useState<boolean | null>(null);
  const [detectedOriginUrl, setDetectedOriginUrl] = useState<string | null>(null);

  // My Settings overrides
  const [setupScript, setSetupScript] = useState('');
  const [runScript, setRunScript] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');

  const handleSelectFolder = useCallback(async () => {
    const result = await window.traceAPI.selectFolder();
    if (!result.success || result.canceled || !result.path) return;

    const selectedPath = result.path;
    setRepoError(null);
    setUrlMatch(null);
    setDetectedOriginUrl(null);
    setValidating(true);

    try {
      const validateResult = await window.traceAPI.validateRepo(selectedPath);
      if (!validateResult.valid) {
        setRepoError(validateResult.error ?? 'Invalid repository');
        return;
      }

      setDetectedOriginUrl(validateResult.originUrl ?? null);

      // Compare origin URL with channel's githubUrl
      if (channel.githubUrl && validateResult.originUrl) {
        if (gitUrlsMatch(channel.githubUrl, validateResult.originUrl)) {
          setUrlMatch(true);
          setLocalRepoPath(selectedPath);
        } else {
          setUrlMatch(false);
          setRepoError("This folder's git remote doesn't match the channel's repository");
        }
      } else {
        // No githubUrl on channel or no origin — allow it
        setUrlMatch(true);
        setLocalRepoPath(selectedPath);
      }
    } catch {
      setRepoError('Failed to validate path');
    } finally {
      setValidating(false);
    }
  }, [channel.githubUrl]);

  const handleJoin = useCallback(() => {
    if (!localRepoPath) return;
    onJoined({
      localRepoPath,
      setupScript: setupScript.trim() || undefined,
      runScript: runScript.trim() || undefined,
      systemInstructions: systemInstructions.trim() || undefined,
    });
  }, [localRepoPath, setupScript, runScript, systemInstructions, onJoined]);

  const textareaClass = 'w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-edge-hover resize-none font-mono';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Join #{channel.name}</h2>
          <Tooltip text="Close" position="bottom">
            <button type="button" onClick={onCancel} className="text-muted hover:text-primary">
              <FiX className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Expected repo URL */}
          {channel.githubUrl && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-primary">Expected Repository</label>
              <div className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-muted truncate">
                {channel.githubUrl}
              </div>
            </div>
          )}

          {/* Folder picker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-primary">Local Repository</label>
            {localRepoPath && urlMatch ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-muted truncate">
                  {localRepoPath}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLocalRepoPath('');
                    setUrlMatch(null);
                    setDetectedOriginUrl(null);
                    setRepoError(null);
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
            {urlMatch === true && detectedOriginUrl && (
              <p className="mt-1 flex items-center gap-1 text-xs text-green-400">
                <FiCheck className="h-3 w-3" aria-hidden="true" />
                Origin matches: <span className="text-muted">{detectedOriginUrl}</span>
              </p>
            )}
            {repoError && (
              <p className="mt-1 text-xs text-red-400">{repoError}</p>
            )}
          </div>

          {/* My Settings section (only after successful folder selection) */}
          {localRepoPath && urlMatch && (
            <>
              <div className="border-t border-edge" />
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">My Settings</h3>

                {/* Setup Script Override */}
                <div className="mb-4">
                  <div className="mb-2">
                    <label className="text-xs font-medium text-primary">Setup Script Override</label>
                    <p className="text-xs text-muted">Overrides the channel default setup script</p>
                  </div>
                  <textarea
                    value={setupScript}
                    onChange={(e) => setSetupScript(e.target.value)}
                    placeholder={channel.defaultSetupScript || 'e.g. cp ../.env .env\nnpm install'}
                    rows={3}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className={textareaClass}
                  />
                </div>

                {/* Run Script Override */}
                <div className="mb-4">
                  <div className="mb-2">
                    <label className="text-xs font-medium text-primary">Run Script Override</label>
                    <p className="text-xs text-muted">Overrides the channel default run script</p>
                  </div>
                  <textarea
                    value={runScript}
                    onChange={(e) => setRunScript(e.target.value)}
                    placeholder={channel.defaultRunScript || 'e.g. npm run dev'}
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
                    value={systemInstructions}
                    onChange={(e) => setSystemInstructions(e.target.value)}
                    placeholder="e.g. This is a TypeScript monorepo. Always run tests with `npm test` from the root."
                    rows={3}
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-edge-hover resize-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost rounded px-3 py-1.5 text-xs text-muted hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleJoin}
            disabled={!localRepoPath || !urlMatch}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium text-on-accent"
          >
            Join Channel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
