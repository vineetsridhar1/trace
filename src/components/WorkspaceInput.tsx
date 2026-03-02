import { useCallback, useRef, useState } from 'react';
import { FiSend, FiCheck, FiAlertCircle, FiDownload, FiRefreshCw } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { useClaudeRunStore } from '../stores/claudeRunStore';
import { useChannelContext } from '../context/ChannelContext';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useFileMention } from '../hooks/useFileMention';
import { useImageAttachments } from '../hooks/useImageAttachments';
import { useSyncStore } from '../stores/syncStore';
import { SlashCommandMenu } from './SlashCommandMenu';
import { FileMentionMenu } from './FileMentionMenu';
import { ImageThumbnails } from './ImageThumbnails';

export function WorkspaceInput() {
  const sendMessage = useClaudeRunStore((s) => s.workspaceActions.sendMessage);
  const { enrichedActiveChannel } = useChannelContext();
  const repoPath = enrichedActiveChannel?.localRepoPath ?? '';
  const baseBranch = enrichedActiveChannel?.baseBranch || 'main';
  const isChecking = useSyncStore((s) => s.isChecking);
  const isPulling = useSyncStore((s) => s.isPulling);
  const isUpToDate = useSyncStore((s) => s.isUpToDate);
  const commitsBehind = useSyncStore((s) => s.commitsBehind);
  const syncError = useSyncStore((s) => s.error);
  const [messageInput, setMessageInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashCommands = useSlashCommands(messageInput, setMessageInput, repoPath);
  const fileMention = useFileMention(messageInput, setMessageInput, repoPath, textareaRef);
  const imageAttachments = useImageAttachments();

  const handleSendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (!text) return;
    const attachmentIds = imageAttachments.getAttachmentIds();
    const imageFilePaths = imageAttachments.getFilePaths();
    const mentionedFiles = fileMention.getMentionedFiles();
    const allFilePaths = [...imageFilePaths, ...mentionedFiles];
    const sent = await sendMessage(
      text,
      attachmentIds.length > 0 ? attachmentIds : undefined,
      allFilePaths.length > 0 ? allFilePaths : undefined,
    );
    if (sent) {
      setMessageInput('');
      imageAttachments.clearAttachments();
      fileMention.clearMentions();
    }
  }, [messageInput, sendMessage, imageAttachments, fileMention]);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <ImageThumbnails images={imageAttachments.attachments} onRemove={imageAttachments.removeAttachment} />
      {imageAttachments.uploading && (
        <div className="flex items-center gap-2 px-1 pb-2">
          <svg className="h-3.5 w-3.5 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
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
            id="message-input"
            rows={1}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onSelect={fileMention.handleSelect}
            onPaste={(e) => void imageAttachments.handlePaste(e)}
            onKeyDown={(e) => {
              if (fileMention.handleKeyDown(e)) return;
              if (slashCommands.handleKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder="Create a workspace..."
            style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
            className="w-full resize-none rounded-md border border-[#292e42] bg-[#1f2335] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
          />
        </div>
        <Tooltip text="Send">
          <button
            id="message-send"
            type="button"
            onClick={() => void handleSendMessage()}
            className="h-[38px] cursor-pointer rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            <FiSend className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      {repoPath && (isUpToDate !== null || syncError) && (
        <div className="flex items-center gap-2 px-1 pt-2">
          {isChecking ? (
            <>
              <FiRefreshCw className="h-3 w-3 animate-spin text-[#565f89]" />
              <span className="text-xs text-[#565f89]">Checking {baseBranch}...</span>
            </>
          ) : syncError ? (
            <>
              <FiAlertCircle className="h-3 w-3 text-red-400" />
              <span className="text-xs text-red-400 truncate">{syncError}</span>
              <button
                type="button"
                onClick={() => void useSyncStore.getState().checkMainBranch(repoPath, baseBranch)}
                className="cursor-pointer text-xs text-[#565f89] hover:text-[#c0caf5] transition-colors"
              >
                <FiRefreshCw className="h-3 w-3" />
              </button>
            </>
          ) : isUpToDate ? (
            <>
              <FiCheck className="h-3 w-3 text-green-400" />
              <span className="text-xs text-green-400">{baseBranch} is up to date</span>
              <button
                type="button"
                onClick={() => void useSyncStore.getState().checkMainBranch(repoPath, baseBranch)}
                className="cursor-pointer text-xs text-[#565f89] hover:text-[#c0caf5] transition-colors"
              >
                <FiRefreshCw className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              <FiAlertCircle className="h-3 w-3 text-yellow-400" />
              <span className="text-xs text-yellow-400">
                {baseBranch} is {commitsBehind} commit{commitsBehind !== 1 ? 's' : ''} behind
              </span>
              <button
                type="button"
                onClick={() => void useSyncStore.getState().pullMainBranch(repoPath, baseBranch)}
                disabled={isPulling}
                className="flex cursor-pointer items-center gap-1 rounded bg-[#292e42] px-2 py-0.5 text-xs text-[#c0caf5] hover:bg-[#343a55] transition-colors disabled:opacity-50"
              >
                {isPulling ? (
                  <FiRefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <FiDownload className="h-3 w-3" />
                )}
                Pull
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
