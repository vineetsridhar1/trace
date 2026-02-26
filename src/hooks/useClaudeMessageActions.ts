import { useCallback, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChannelMessage, ServerEvent, TicketStatus, ClaudeModel, EffortLevel } from '../types';
import type { PlanResponseMode } from '../context/ClaudeActionsContext';
import { MESSAGE_FIELDS } from '../graphql/fragments';
import {
  useCreateMessageMutation,
  useAppendPromptMutation,
  useUpdateMessagePreviewMutation,
} from './__generated__/useClaudeMessageActions.generated';

const GQL_CREATE_MESSAGE = gql`
  mutation CreateMessage($channelId: ID!, $text: String!, $attachmentIds: [String!]) {
    createMessage(channelId: $channelId, text: $text, attachmentIds: $attachmentIds) {
      message {
        ...MessageFields
      }
      thread {
        id
        messageId
        createdAt
        eventCount
      }
      event {
        id
        sessionId
        hookEventName
        timestamp
        threadId
        importance
      }
    }
  }
  ${MESSAGE_FIELDS}
`;

const GQL_APPEND_PROMPT = gql`
  mutation AppendPrompt($channelId: ID!, $messageId: ID!, $text: String!, $attachmentIds: [String!], $createNewThread: Boolean, $threadId: ID) {
    appendPrompt(channelId: $channelId, messageId: $messageId, text: $text, attachmentIds: $attachmentIds, createNewThread: $createNewThread, threadId: $threadId) {
      message {
        ...MessageFields
      }
      thread {
        id
        messageId
        createdAt
        eventCount
      }
      event {
        id
        sessionId
        hookEventName
        timestamp
        threadId
        importance
      }
    }
  }
  ${MESSAGE_FIELDS}
`;

const GQL_UPDATE_PREVIEW = gql`
  mutation UpdateMessagePreview($channelId: ID!, $messageId: ID!, $preview: String!) {
    updateMessagePreview(channelId: $channelId, messageId: $messageId, preview: $preview) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

interface UseClaudeMessageActionsOptions {
  activeChannelId: string | null;
  selectedMessageId: string | null;
  selectedMessageRef: RefObject<ChannelMessage | null>;
  selectedMessageIdRef: RefObject<string | null>;
  activeThreadIdRef: RefObject<string | null>;
  threadEventsRef: RefObject<ServerEvent[]>;
  clearThread: () => Promise<string | null>;
  onMessageCreated: (message: ChannelMessage) => void;
  loadThreadEvents: (message: ChannelMessage) => Promise<void>;
  upsertMessage: (message: ChannelMessage) => void;
  setHasWorktree: Dispatch<SetStateAction<boolean | null>>;
  updateMessageStatus: (messageId: string, status: TicketStatus) => Promise<void>;
  getCreationCommands: () => string[];
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  getSystemInstructions: () => string | undefined;
}

interface SpawnOptions {
  statusOnSuccess?: TicketStatus;
  errorPrefix: string;
  setHasWorktreeOnSuccess?: boolean;
  creationCommands?: string[];
  resumeSessionId?: string;
  filePaths?: string[];
  model?: string;
  effort?: string;
  systemInstructions?: string;
}

export function useClaudeMessageActions({
  activeChannelId,
  selectedMessageId,
  selectedMessageRef,
  selectedMessageIdRef,
  activeThreadIdRef,
  threadEventsRef,
  clearThread,
  onMessageCreated,
  loadThreadEvents,
  upsertMessage,
  setHasWorktree,
  updateMessageStatus,
  getCreationCommands,
  getChannelRepoPath,
  getChannelBaseBranch,
  getSystemInstructions,
}: UseClaudeMessageActionsOptions) {
  const [executeCreateMessage] = useCreateMessageMutation();
  const [executeAppendPrompt] = useAppendPromptMutation();
  const [executeUpdatePreview] = useUpdateMessagePreviewMutation();

  const spawnedMessageIdsRef = useRef(new Set<string>());
  const [pendingRunMessageId, setPendingRunMessageId] = useState<string | null>(
    null,
  );
  const [pendingRunInitialPrompt, setPendingRunInitialPrompt] = useState('');
  const [pendingRunFilePaths, setPendingRunFilePaths] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>('opus');
  const [selectedEffort, setSelectedEffort] = useState<EffortLevel>('high');

  const spawnClaudeForMessage = useCallback(
    async (messageId: string, prompt: string, options: SpawnOptions) => {
      spawnedMessageIdsRef.current.add(messageId);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.spawnClaude(messageId, prompt, repoPath, options.creationCommands, options.resumeSessionId, options.filePaths, options.model, options.effort, options.systemInstructions);

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
        const { data } = await executeUpdatePreview({
          variables: {
            channelId: activeChannelId,
            messageId,
            preview,
          },
        });

        if (!data) return;
        upsertMessage(data.updateMessagePreview as ChannelMessage);
      } catch {
        // Preview updates are best-effort and should not block execution.
      }
    },
    [activeChannelId, executeUpdatePreview, upsertMessage],
  );

  const persistPrompt = useCallback(
    async (messageId: string, text: string, errorLabel: string, attachmentIds?: string[], createNewThread?: boolean, threadId?: string) => {
      if (!activeChannelId) return null;

      try {
        const { data } = await executeAppendPrompt({
          variables: {
            channelId: activeChannelId,
            messageId,
            text,
            attachmentIds,
            createNewThread,
            threadId,
          },
        });

        if (!data?.appendPrompt) {
          console.error(errorLabel);
          return null;
        }

        const message = data.appendPrompt.message as ChannelMessage;
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
    [activeChannelId, executeAppendPrompt, loadThreadEvents, selectedMessageIdRef, upsertMessage],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      if (!text || !activeChannelId) return false;

      try {
        const { data } = await executeCreateMessage({
          variables: {
            channelId: activeChannelId,
            text,
            attachmentIds,
          },
        });

        if (!data?.createMessage) return false;

        const message = data.createMessage.message as ChannelMessage;
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
    [activeChannelId, executeCreateMessage, onMessageCreated, upsertMessage],
  );

  const runPendingMessage = useCallback(
    async (planMode: boolean, promptText: string) => {
      const editedPrompt = promptText.trim();
      if (!pendingRunMessageId || !editedPrompt) return;

      const prompt = planMode
        ? `<trace-internal>\nBefore implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n</trace-internal>\n\n${editedPrompt}`
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

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (userInstructions) instructionParts.push(userInstructions);

      const success = await spawnClaudeForMessage(messageId, prompt, {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
        systemInstructions: instructionParts.join('\n\n'),
      });

      if (!success && creationCommands.length > 0) {
        await updateMessageStatus(messageId, 'pending');
      }
    },
    [getChannelBaseBranch, getCreationCommands, getSystemInstructions, pendingRunMessageId, pendingRunFilePaths, selectedModel, selectedEffort, spawnClaudeForMessage, updateMessageStatus, updatePreviewForPendingRun],
  );

  const autoRunQueuedTicket = useCallback(
    async (messageId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      const prompt = runConfig.planMode
        ? `<trace-internal>\nBefore implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n</trace-internal>\n\n${runConfig.prompt}`
        : runConfig.prompt;

      const creationCommands = getCreationCommands();

      await updatePreviewForPendingRun(messageId, runConfig.prompt);

      if (creationCommands.length > 0) {
        await updateMessageStatus(messageId, 'creation');
      }

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (userInstructions) instructionParts.push(userInstructions);

      const success = await spawnClaudeForMessage(messageId, prompt, {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to auto-run queued ticket',
        creationCommands,
        model: runConfig.model,
        effort: runConfig.model !== 'haiku' ? runConfig.effort : undefined,
        systemInstructions: instructionParts.join('\n\n'),
      });

      if (!success && creationCommands.length > 0) {
        await updateMessageStatus(messageId, 'pending');
      }
    },
    [getChannelBaseBranch, getCreationCommands, getSystemInstructions, spawnClaudeForMessage, updateMessageStatus, updatePreviewForPendingRun],
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

      const currentThreadId = activeThreadIdRef.current ?? undefined;

      const persisted = await persistPrompt(
        selectedMessage.id,
        text,
        'Failed to persist thread prompt',
        attachmentIds,
        undefined,
        currentThreadId,
      );
      if (!persisted) return false;

      // If active thread has events → resume existing session
      // If active thread is empty (just cleared) → spawn fresh
      const hasEvents = (threadEventsRef.current?.length ?? 0) > 0;
      const spawnOptions: SpawnOptions = {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands: getCreationCommands(),
        filePaths: filePaths && filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
      };

      if (hasEvents) {
        // Resume existing session
        spawnOptions.resumeSessionId = selectedMessage.claudeSessionId ?? undefined;
      } else {
        // Fresh spawn — include system instructions
        const baseBranch = getChannelBaseBranch();
        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];
        if (userInstructions) instructionParts.push(userInstructions);
        spawnOptions.systemInstructions = instructionParts.join('\n\n');
      }

      await spawnClaudeForMessage(selectedMessage.id, text, spawnOptions);
      return true;
    },
    [activeChannelId, activeThreadIdRef, threadEventsRef, getChannelBaseBranch, getCreationCommands, getSystemInstructions, persistPrompt, selectedMessageRef, selectedModel, selectedEffort, spawnClaudeForMessage],
  );

  const sendPlanResponse = useCallback(
    async (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => {
      const selectedMessage = selectedMessageRef.current;
      if (!selectedMessage || !activeChannelId) return;

      if (mode === 'clear-context') {
        // Build prompt with the plan content for a fresh Claude process
        const implementPrompt = planFilePath
          ? `Implement the following approved plan. The plan file is at ${planFilePath}.\n\n${planContent ?? text}`
          : `Implement the following approved plan:\n\n${planContent ?? text}`;

        // Create a new thread and switch to it so SSE events are routed correctly
        const newThreadId = (await clearThread()) ?? undefined;

        const persisted = await persistPrompt(
          selectedMessage.id,
          implementPrompt,
          'Failed to persist plan approval prompt',
          undefined,
          undefined,
          newThreadId,
        );
        if (!persisted) return;

        // Spawn a brand new Claude process (no resumeSessionId)
        const baseBranch = getChannelBaseBranch();
        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];
        if (userInstructions) instructionParts.push(userInstructions);

        await spawnClaudeForMessage(selectedMessage.id, implementPrompt, {
          errorPrefix: 'Failed to spawn claude for plan implementation',
          statusOnSuccess: 'in_progress',
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
          systemInstructions: instructionParts.join('\n\n'),
          // No resumeSessionId — fresh process with clear context
        });

      } else if (mode === 'keep-context') {
        const trimmed = text.trim();
        if (!trimmed) return;

        const persisted = await persistPrompt(
          selectedMessage.id,
          trimmed,
          'Failed to persist plan response prompt',
        );
        if (!persisted) return;

        await spawnClaudeForMessage(selectedMessage.id, trimmed, {
          errorPrefix: 'Failed to spawn claude for plan response',
          statusOnSuccess: 'in_progress',
          resumeSessionId: selectedMessage.claudeSessionId ?? undefined,
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
        });

      } else if (mode === 'revise') {
        const trimmed = text.trim();
        if (!trimmed) return;

        // Persist the clean user text for display in the thread
        const persisted = await persistPrompt(
          selectedMessage.id,
          trimmed,
          'Failed to persist plan revision prompt',
        );
        if (!persisted) return;

        // Wrap with trace-internal instructions so Claude revises the plan
        const wrappedPrompt = `<trace-internal>\nThe user has provided feedback on your plan. Go back into plan mode and revise the plan based on their suggestions below. Only revise the plan — do not start implementing yet.\n</trace-internal>\n\n${trimmed}`;

        await spawnClaudeForMessage(selectedMessage.id, wrappedPrompt, {
          errorPrefix: 'Failed to spawn claude for plan revision',
          resumeSessionId: selectedMessage.claudeSessionId ?? undefined,
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
        });
      }
    },
    [activeChannelId, clearThread, getChannelBaseBranch, getSystemInstructions, persistPrompt, selectedMessageRef, selectedModel, selectedEffort, spawnClaudeForMessage],
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
    selectedModel,
    selectedEffort,
    setSelectedModel,
    setSelectedEffort,
    sendMessage,
    runPendingMessage,
    autoRunQueuedTicket,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    isMessageSpawned,
  };
}
