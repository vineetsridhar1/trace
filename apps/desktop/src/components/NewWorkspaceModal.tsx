import { useState, useCallback, useRef, useEffect } from 'react';
import { FiX, FiEdit3, FiMap, FiHelpCircle } from 'react-icons/fi';
import { useAgentRunStore } from '../stores/agentRunStore';
import { useAppUIStore } from '../stores/appUIStore';
import { useImageAttachments } from '../hooks/useImageAttachments';
import { ImageThumbnails } from './ImageThumbnails';
import { ModelEffortSelector } from './ModelEffortSelector';
import { Tooltip } from './Tooltip';
import type { InteractionMode } from './RunButtons';

const MODE_CYCLE: InteractionMode[] = ['code', 'plan', 'ask'];
const MODE_LABELS: Record<InteractionMode, string> = {
  code: 'Code',
  plan: 'Plan',
  ask: 'Ask',
};
const MODE_ICONS: Record<InteractionMode, React.ReactNode> = {
  code: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
  plan: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
  ask: <FiHelpCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
};
const MODE_TOOLTIPS: Record<InteractionMode, string> = {
  code: 'Code mode – Claude can edit files',
  plan: 'Plan mode – Claude plans before coding',
  ask: 'Ask mode – read-only, no file changes',
};

export function NewWorkspaceModal() {
  const [prompt, setPrompt] = useState('');
  const [startImmediately, setStartImmediately] = useState(true);
  const [mode, setMode] = useState<InteractionMode>('code');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { attachments, uploading, handlePaste, removeAttachment, clearAttachments, getAttachmentIds, getFilePaths } =
    useImageAttachments();

  const selectedAgent = useAgentRunStore((s) => s.selectedAgent);
  const selectedModel = useAgentRunStore((s) => s.selectedModel);
  const selectedEffort = useAgentRunStore((s) => s.selectedEffort);
  const setSelectedAgent = useAgentRunStore((s) => s.setSelectedAgent);
  const setSelectedModel = useAgentRunStore((s) => s.setSelectedModel);
  const setSelectedEffort = useAgentRunStore((s) => s.setSelectedEffort);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    clearAttachments();
    useAppUIStore.getState().setShowNewWorkspaceModal(false);
  }, [clearAttachments]);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    // Close modal immediately
    clearAttachments();
    useAppUIStore.getState().setShowNewWorkspaceModal(false);

    const attachmentIds = getAttachmentIds();
    const filePaths = getFilePaths();

    const store = useAgentRunStore.getState();
    const created = await store.workspaceActions.sendMessage(
      trimmed,
      attachmentIds.length > 0 ? attachmentIds : undefined,
      filePaths.length > 0 ? filePaths : undefined,
    );

    if (created && startImmediately) {
      let finalPrompt = trimmed;
      if (mode === 'plan') {
        finalPrompt = `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${trimmed}`;
      } else if (mode === 'ask') {
        finalPrompt = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${trimmed}`;
      }
      await useAgentRunStore.getState().workspaceActions.runPendingWorkspace(
        mode === 'plan',
        finalPrompt,
        attachmentIds.length > 0 ? attachmentIds : undefined,
        filePaths.length > 0 ? filePaths : undefined,
      );
    }
  }, [prompt, startImmediately, mode, getAttachmentIds, getFilePaths, clearAttachments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleClose, handleSubmit],
  );

  const cycleMode = () => {
    setMode((m) => MODE_CYCLE[(MODE_CYCLE.indexOf(m) + 1) % MODE_CYCLE.length]);
  };

  const modeConfig = MODE_LABELS[mode];

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
            onPaste={handlePaste}
            placeholder="What would you like to build?"
            rows={4}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            className="w-full rounded border border-edge bg-surface-deep px-3 py-2 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover resize-none"
          />
          {uploading && (
            <p className="mt-1 text-xs text-muted">Uploading image…</p>
          )}
          {attachments.length > 0 && (
            <div className="mt-2">
              <ImageThumbnails images={attachments} onRemove={removeAttachment} />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={startImmediately}
                onClick={() => setStartImmediately((v) => !v)}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${
                  startImmediately ? 'bg-accent' : 'bg-edge-hover'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
                    startImmediately ? 'translate-x-3.5 ml-0' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-xs text-primary whitespace-nowrap">Run immediately</span>
            </label>

            <div
              className={`flex items-center gap-1.5 transition-all duration-200 ${
                startImmediately ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <ModelEffortSelector
                agent={selectedAgent}
                model={selectedModel}
                effort={selectedEffort}
                onAgentChange={setSelectedAgent}
                onModelChange={setSelectedModel}
                onEffortChange={setSelectedEffort}
              />
              <Tooltip text={MODE_TOOLTIPS[mode]}>
                <button
                  type="button"
                  onClick={cycleMode}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    mode === 'code'
                      ? 'btn-secondary border-edge text-primary'
                      : mode === 'plan'
                        ? 'border-accent bg-accent/20 text-accent-light'
                        : 'border-amber-500 bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {MODE_ICONS[mode]}
                  {modeConfig}
                </button>
              </Tooltip>
            </div>
          </div>
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
            onClick={() => void handleSubmit()}
            disabled={!prompt.trim()}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium text-on-accent"
          >
            {startImmediately ? 'Create & Run' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
