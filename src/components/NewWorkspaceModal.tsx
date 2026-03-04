import { useState, useCallback, useRef, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { useAgentRunStore } from '../stores/agentRunStore';
import { useAppUIStore } from '../stores/appUIStore';

export function NewWorkspaceModal() {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    useAppUIStore.getState().setShowNewWorkspaceModal(false);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    void useAgentRunStore.getState().workspaceActions.sendMessage(trimmed);
    useAppUIStore.getState().setShowNewWorkspaceModal(false);
  }, [prompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleClose, handleSubmit],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-[560px] max-h-[80vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">New Workspace</h2>
          <button type="button" onClick={handleClose} className="text-muted hover:text-primary">
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to build?"
            rows={4}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            className="w-full rounded border border-edge bg-surface-deep px-3 py-2 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={handleClose}
            className="btn-ghost rounded px-3 py-1.5 text-xs text-muted hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium text-on-accent"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
