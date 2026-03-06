import { useState, useCallback } from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';

interface ProductDocModalProps {
  hasRepo: boolean;
  onClose: () => void;
  onRun: (prompt: string) => void;
}

export function ProductDocModal({ hasRepo, onClose, onRun }: ProductDocModalProps) {
  const [prompt, setPrompt] = useState('');

  const handleRun = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || !hasRepo) return;
    onRun(trimmed);
  }, [prompt, hasRepo, onRun]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleRun();
      }
    },
    [onClose, handleRun],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-[560px] max-h-[80vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">New Product Document</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary">
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4">
          {!hasRepo && (
            <div className="mb-4 flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
              <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
              <p className="text-xs text-yellow-300">
                This channel doesn't have a repository configured. A repo is required so the AI can
                read your codebase and create an informed PRD. Join the channel with a repo first.
              </p>
            </div>
          )}
          <label className="mb-1.5 block text-xs font-medium text-primary">
            What do you want to build?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the product you want to create..."
            autoFocus
            rows={6}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            className="w-full rounded border border-edge bg-surface-deep px-3 py-2 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover resize-none"
          />
          <p className="mt-1.5 text-xs text-muted">
            The AI will explore your codebase and collaborate with you to create a detailed product requirements document.
          </p>
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
            onClick={handleRun}
            disabled={!prompt.trim() || !hasRepo}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium text-on-accent"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
