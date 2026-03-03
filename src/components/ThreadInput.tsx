import { useCallback, useEffect, useRef, useState } from 'react';
import { FiSend, FiX, FiClock } from 'react-icons/fi';
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
  const [isQueued, setIsQueued] = useState(false);
  const [mode, setMode] = useState<InteractionMode>('code');
  const cycleMode = () => {
    const modes: InteractionMode[] = ['code', 'plan', 'ask'];
    setMode((m) => modes[(modes.indexOf(m) + 1) % 3]);
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashCommands = useSlashCommands(threadInput, setThreadInput, repoPath);
  const fileMention = useFileMention(threadInput, setThreadInput, repoPath, textareaRef);
  const imageAttachments = useImageAttachments();

  const sendNow = useCallback(async () => {
    const text = threadInput.trim();
    if (!text) return;

    // Intercept /clear command
    if (text === '/clear' || text.startsWith('/clear ')) {
      setThreadInput('');
      setIsQueued(false);
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

    // Clear input optimistically to prevent queue button flash
    const previousInput = threadInput;
    setThreadInput('');
    setIsQueued(false);
    imageAttachments.clearAttachments();
    fileMention.clearMentions();

    const sent = await onSendThreadMessage(
      finalText,
      attachmentIds.length > 0 ? attachmentIds : undefined,
      allFilePaths.length > 0 ? allFilePaths : undefined,
    );
    if (!sent) {
      // Restore input on failure
      setThreadInput(previousInput);
    }
  }, [threadInput, mode, onSendThreadMessage, onClearThread, imageAttachments, fileMention]);

  const handleSendOrQueue = useCallback(() => {
    const text = threadInput.trim();
    if (!text) return;

    if (isClaudeRunning) {
      // Queue the message for when Claude finishes
      setIsQueued(true);
    } else {
      void sendNow();
    }
  }, [threadInput, isClaudeRunning, sendNow]);

  // Auto-send queued message when Claude finishes
  const wasRunningRef = useRef(isClaudeRunning);
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = isClaudeRunning;

    if (wasRunning && !isClaudeRunning && isQueued) {
      void sendNow();
    }
  }, [isClaudeRunning, isQueued, sendNow]);

  return (
    <div className="border-t border-edge px-3 py-3">
      {isClaudeRunning && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-accent-light"
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
          <span className="text-xs text-accent-light">Claude is working...</span>
          {lastUserMessageTime && (
            <ElapsedTimer startTime={lastUserMessageTime} />
          )}
        </div>
      )}
      {isQueued && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <FiClock className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
          <span className="text-xs text-amber-400">Message queued — will send when Claude finishes</span>
          <button
            type="button"
            onClick={() => setIsQueued(false)}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
          >
            <FiX className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}
      <ImageThumbnails
        images={imageAttachments.attachments}
        onRemove={imageAttachments.removeAttachment}
      />
      {imageAttachments.uploading && (
        <div className="flex items-center gap-2 px-1 pb-2">
          <svg
            className="h-3.5 w-3.5 animate-spin text-accent-light"
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
          <span className="text-xs text-muted">Uploading...</span>
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
            onChange={(e) => {
              setThreadInput(e.target.value);
              if (!e.target.value.trim()) setIsQueued(false);
            }}
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
                handleSendOrQueue();
              }
            }}
            placeholder={
              isClaudeRunning
                ? isQueued
                  ? 'Edit your queued message...'
                  : 'Type a message to queue...'
                : 'Send to Claude...'
            }
            style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
            className={`w-full resize-none rounded-md border bg-surface px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-accent ${isQueued ? 'border-amber-500/50' : 'border-edge'}`}
          />
        </div>
        {isClaudeRunning ? (
          <div className="flex gap-1.5">
            {!isQueued && threadInput.trim() && (
              <Tooltip text="Queue message">
                <button
                  id="thread-queue"
                  type="button"
                  onClick={handleSendOrQueue}
                  className="h-[38px] cursor-pointer rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                >
                  <FiClock className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
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
          </div>
        ) : (
          <Tooltip text="Send message">
            <button
              id="thread-send"
              type="button"
              onClick={() => void sendNow()}
              className="h-[38px] cursor-pointer rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-light"
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
