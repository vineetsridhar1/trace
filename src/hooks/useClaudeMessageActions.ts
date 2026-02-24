import { useCallback, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChannelMessage, TicketStatus } from '../types';
import { SERVER_URL } from '../types';

interface UseClaudeMessageActionsOptions {
  activeChannelId: string | null;
  selectedMessageId: string | null;
  selectedMessageRef: RefObject<ChannelMessage | null>;
  selectedMessageIdRef: RefObject<string | null>;
  onMessageCreated: (message: ChannelMessage) => void;
  loadThreadEvents: (message: ChannelMessage) => Promise<void>;
  upsertMessage: (message: ChannelMessage) => void;
  setHasWorktree: Dispatch<SetStateAction<boolean | null>>;
  updateMessageStatus: (messageId: string, status: TicketStatus) => Promise<void>;
  getCreationCommands: () => string[];
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
}

interface SpawnOptions {
  statusOnSuccess?: TicketStatus;
  errorPrefix: string;
  setHasWorktreeOnSuccess?: boolean;
  creationCommands?: string[];
  resumeSessionId?: string;
  filePaths?: string[];
}

export function useClaudeMessageActions({
  activeChannelId,
  selectedMessageId,
  selectedMessageRef,
  selectedMessageIdRef,
  onMessageCreated,
  loadThreadEvents,
  upsertMessage,
  setHasWorktree,
  updateMessageStatus,
  getCreationCommands,
  getChannelRepoPath,
  getChannelBaseBranch,
}: UseClaudeMessageActionsOptions) {
  const spawnedMessageIdsRef = useRef(new Set<string>());
  const [pendingRunMessageId, setPendingRunMessageId] = useState<string | null>(
    null,
  );
  const [pendingRunInitialPrompt, setPendingRunInitialPrompt] = useState('');
  const [pendingRunFilePaths, setPendingRunFilePaths] = useState<string[]>([]);

  const spawnClaudeForMessage = useCallback(
    async (messageId: string, prompt: string, options: SpawnOptions) => {
      spawnedMessageIdsRef.current.add(messageId);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.spawnClaude(messageId, prompt, repoPath, options.creationCommands, options.resumeSessionId, options.filePaths);

        if (!result.success) {
          spawnedMessageIdsRef.current.delete(messageId);
          console.error(`${options.errorPrefix}:`, result.error);
          return false;
        }

        if (options.setHasWorktreeOnSuccess !== false) {
          setHasWorktree(true);
        }

        if (options.statusOnSuccess) {
          await updateMessageStatus(messageId, options.statusOnSuccess);
        }

        return true;
      } catch {
        spawnedMessageIdsRef.current.delete(messageId);
        console.error(options.errorPrefix);
        return false;
      }
    },
    [getChannelRepoPath, setHasWorktree, updateMessageStatus],
  );

  const updatePreviewForPendingRun = useCallback(
    async (messageId: string, preview: string) => {
      if (!activeChannelId) return;

      try {
        const response = await fetch(
          `${SERVER_URL}/channels/${activeChannelId}/messages/${messageId}/preview`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preview }),
          },
        );

        if (!response.ok) return;
        const { message } = (await response.json()) as { message: ChannelMessage };
        upsertMessage(message);
      } catch {
        // Preview updates are best-effort and should not block execution.
      }
    },
    [activeChannelId, upsertMessage],
  );

  const persistPrompt = useCallback(
    async (messageId: string, text: string, errorLabel: string, attachmentIds?: string[]) => {
      if (!activeChannelId) return null;

      try {
        const response = await fetch(
          `${SERVER_URL}/channels/${activeChannelId}/messages/${messageId}/prompts`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, attachmentIds }),
          },
        );

        if (!response.ok) {
          console.error(errorLabel);
          return null;
        }

        const { message } = (await response.json()) as { message: ChannelMessage };
        upsertMessage(message);
        if (selectedMessageIdRef.current === message.id) {
          void loadThreadEvents(message);
        }
        return message;
      } catch {
        console.error(errorLabel);
        return null;
      }
    },
    [activeChannelId, loadThreadEvents, selectedMessageIdRef, upsertMessage],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      if (!text || !activeChannelId) return false;

      try {
        const response = await fetch(`${SERVER_URL}/channels/${activeChannelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, attachmentIds }),
        });
        if (!response.ok) return false;

        const { message } = (await response.json()) as { message: ChannelMessage };
        upsertMessage(message);
        onMessageCreated(message);
        setPendingRunMessageId(message.id);
        setPendingRunInitialPrompt(text);
        setPendingRunFilePaths(filePaths ?? []);
        return true;
      } catch {
        console.error('Failed to send message');
        return false;
      }
    },
    [activeChannelId, onMessageCreated, upsertMessage],
  );

  const runPendingMessage = useCallback(
    async (planMode: boolean, promptText: string) => {
      const editedPrompt = promptText.trim();
      if (!pendingRunMessageId || !editedPrompt) return;

      const prompt = planMode
        ? `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${editedPrompt}`
        : editedPrompt;

      const messageId = pendingRunMessageId;
      const filePaths = pendingRunFilePaths;
      setPendingRunMessageId(null);
      setPendingRunInitialPrompt('');
      setPendingRunFilePaths([]);

      const creationCommands = getCreationCommands();

      if (creationCommands.length > 0) {
        await updateMessageStatus(messageId, 'creation');
      }

      await updatePreviewForPendingRun(messageId, editedPrompt);
      const success = await spawnClaudeForMessage(messageId, prompt, {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
      });

      if (!success && creationCommands.length > 0) {
        await updateMessageStatus(messageId, 'pending');
      }
    },
    [getCreationCommands, pendingRunMessageId, pendingRunFilePaths, spawnClaudeForMessage, updateMessageStatus, updatePreviewForPendingRun],
  );

  const stopClaude = useCallback(async () => {
    if (!selectedMessageId) return;
    await window.traceAPI.stopClaude(selectedMessageId);
  }, [selectedMessageId]);

  const sendThreadMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      const selectedMessage = selectedMessageRef.current;
      if (!text || !selectedMessage || !activeChannelId) return false;

      const persisted = await persistPrompt(
        selectedMessage.id,
        text,
        'Failed to persist thread prompt',
        attachmentIds,
      );
      if (!persisted) return false;

      await spawnClaudeForMessage(selectedMessage.id, text, {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands: getCreationCommands(),
        resumeSessionId: selectedMessage.claudeSessionId ?? undefined,
        filePaths: filePaths && filePaths.length > 0 ? filePaths : undefined,
      });
      return true;
    },
    [activeChannelId, getCreationCommands, persistPrompt, selectedMessageRef, spawnClaudeForMessage],
  );

  const sendPlanResponse = useCallback(
    async (text: string, claudePrompt?: string) => {
      const trimmed = text.trim();
      const selectedMessage = selectedMessageRef.current;
      if (!trimmed || !selectedMessage || !activeChannelId) return;

      const persisted = await persistPrompt(
        selectedMessage.id,
        trimmed,
        'Failed to persist plan response prompt',
      );
      if (!persisted) return;

      await spawnClaudeForMessage(selectedMessage.id, claudePrompt ?? trimmed, {
        errorPrefix: 'Failed to spawn claude for plan response',
        resumeSessionId: selectedMessage.claudeSessionId ?? undefined,
      });
    },
    [activeChannelId, persistPrompt, selectedMessageRef, spawnClaudeForMessage],
  );

  const mergeToMain = useCallback(async () => {
    const selectedMessage = selectedMessageRef.current;
    if (!selectedMessage || !activeChannelId) return;

    const baseBranch = getChannelBaseBranch();
    const prompt = `/merge-to-main ${baseBranch}`;
    const persisted = await persistPrompt(
      selectedMessage.id,
      prompt,
      'Failed to persist merge-to-main prompt',
    );
    if (!persisted) return;

    await spawnClaudeForMessage(selectedMessage.id, prompt, {
      statusOnSuccess: 'completed',
      errorPrefix: 'Failed to spawn claude for merge-to-main',
      setHasWorktreeOnSuccess: false,
    });
  }, [activeChannelId, getChannelBaseBranch, persistPrompt, selectedMessageRef, spawnClaudeForMessage]);

  const isMessageSpawned = useCallback((messageId: string) => {
    return spawnedMessageIdsRef.current.has(messageId);
  }, []);

  return {
    pendingRunMessageId,
    pendingRunInitialPrompt,
    sendMessage,
    runPendingMessage,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    isMessageSpawned,
  };
}
