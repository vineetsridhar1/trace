import { useCallback, useRef, useState } from 'react';
import { FiSend } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { ModelEffortSelector } from './ModelEffortSelector';
import { useClaudeRunStore } from '../stores/claudeRunStore';
import { useChannelContext } from '../context/ChannelContext';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useFileMention } from '../hooks/useFileMention';
import { useImageAttachments } from '../hooks/useImageAttachments';
import { SlashCommandMenu } from './SlashCommandMenu';
import { FileMentionMenu } from './FileMentionMenu';
import { ImageThumbnails } from './ImageThumbnails';
import { ElapsedTimer } from './ElapsedTimer';
import { InteractionModeToggle, type InteractionMode } from './RunButtons';

export function ThreadInput({
  isClaudeRunning,
  lastUserMessageTime,
  onSendThreadMessage,
  onStopClaude,
  onClearThread,
}: {
  isClaudeRunning: boolean;
  lastUserMessageTime: string | null;
  onSendThreadMessage: (
    text: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<boolean>;
  onStopClaude: () => void;
  onClearThread: () => Promise<string | null>;
}) {
  const { enrichedActiveChannel } = useChannelContext();
  const repoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const selectedModel = useClaudeRunStore((s) => s.selectedModel);
  const selectedEffort = useClaudeRunStore((s) => s.selectedEffort);
  const setSelectedModel = useClaudeRunStore((s) => s.setSelectedModel);
  const setSelectedEffort = useClaudeRunStore((s) => s.setSelectedEffort);
  const [threadInput, setThreadInput] = useState('');
  const [mode, setMode] = useState<InteractionMode>('code');
  const cycleMode = () => {
    const modes: InteractionMode[] = ['code', 'plan', 'ask'];
    setMode((m) => modes[(modes.indexOf(m) + 1) % 3]);
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashCommands = useSlashCommands(threadInput, setThreadInput);
  const fileMention = useFileMention(threadInput, setThreadInput, repoPath, textareaRef);
  const imageAttachments = useImageAttachments();

  const handleSendThreadMessage = useCallback(async () => {
    const text = threadInput.trim();
    if (!text || isClaudeRunning) return;

    // Intercept /clear command
    if (text === '/clear' || text.startsWith('/clear ')) {
      setThreadInput('');
      await onClearThread();
      return;
    }

    let finalText = text;
    if (mode === 'plan') {
      finalText = `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${text}`;
    } else if (mode === 'ask') {
      finalText = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${text}`;
    }

    const attachmentIds = imageAttachments.getAttachmentIds();
    const imageFilePaths = imageAttachments.getFilePaths();
    const mentionedFiles = fileMention.getMentionedFiles();
    const allFilePaths = [...imageFilePaths, ...mentionedFiles];
    const sent = await onSendThreadMessage(
      finalText,
      attachmentIds.length > 0 ? attachmentIds : undefined,
      allFilePaths.length > 0 ? allFilePaths : undefined,
    );
    if (sent) {
      setThreadInput('');
      imageAttachments.clearAttachments();
      fileMention.clearMentions();
    }
  }, [threadInput, mode, isClaudeRunning, onSendThreadMessage, onClearThread, imageAttachments, fileMention]);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      {isClaudeRunning && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
          <span className="text-xs text-violet-400">Claude is working...</span>
          {lastUserMessageTime && (
            <ElapsedTimer startTime={lastUserMessageTime} />
          )}
        </div>
      )}
      <ImageThumbnails
        images={imageAttachments.attachments}
        onRemove={imageAttachments.removeAttachment}
      />
      {imageAttachments.uploading && (
        <div className="flex items-center gap-2 px-1 pb-2">
          <svg
            className="h-3.5 w-3.5 animate-spin text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
          <span className="text-xs text-[#565f89]">Uploading...</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative flex flex-col flex-1">
          <SlashCommandMenu
            isOpen={slashCommands.isOpen}
            commands={slashCommands.filteredCommands}
            selectedIndex={slashCommands.selectedIndex}
            onSelect={slashCommands.selectCommand}
          />
          <FileMentionMenu
            isOpen={fileMention.isOpen}
            files={fileMention.filteredFiles}
            selectedIndex={fileMention.selectedIndex}
            onSelect={fileMention.selectFile}
          />
          <textarea
            ref={textareaRef}
            id="thread-input"
            rows={1}
            value={threadInput}
            disabled={isClaudeRunning}
            onChange={(e) => setThreadInput(e.target.value)}
            onSelect={fileMention.handleSelect}
            onPaste={(e) => void imageAttachments.handlePaste(e)}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                cycleMode();
                return;
              }
              if (fileMention.handleKeyDown(e)) return;
              if (slashCommands.handleKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isClaudeRunning) void handleSendThreadMessage();
              }
            }}
            placeholder={
              isClaudeRunning ? 'Waiting for Claude...' : 'Send to Claude...'
            }
            style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
            className={`w-full resize-none rounded-md border border-[#292e42] bg-[#1a1b26] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500 ${isClaudeRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
        {isClaudeRunning ? (
          <Tooltip text="Stop Claude">
            <button
              id="thread-stop"
              type="button"
              onClick={onStopClaude}
              className="h-[38px] cursor-pointer rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          </Tooltip>
        ) : (
          <Tooltip text="Send message">
            <button
              id="thread-send"
              type="button"
              onClick={() => void handleSendThreadMessage()}
              className="h-[38px] cursor-pointer rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
            >
              <FiSend className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {!isClaudeRunning && (
        <div className="mt-2 flex items-center gap-1.5">
          <ModelEffortSelector
            model={selectedModel}
            effort={selectedEffort}
            onModelChange={setSelectedModel}
            onEffortChange={setSelectedEffort}
          />
          <InteractionModeToggle mode={mode} onCycle={cycleMode} />
        </div>
      )}
    </div>
  );
}
