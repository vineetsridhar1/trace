import { useCallback, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Workspace, ServerEvent, TicketStatus, ClaudeModel, EffortLevel } from '../types';
import type { PlanResponseMode } from '../context/ClaudeActionsContext';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import {
  useCreateWorkspaceMutation,
  useAppendPromptMutation,
  useUpdateWorkspacePreviewMutation,
} from './__generated__/useClaudeMessageActions.generated';

const GQL_CREATE_WORKSPACE = gql`
  mutation CreateWorkspace($channelId: ID!, $text: String!, $attachmentIds: [String!]) {
    createWorkspace(channelId: $channelId, text: $text, attachmentIds: $attachmentIds) {
      workspace {
        ...WorkspaceFields
      }
      session {
        id
        workspaceId
        createdAt
        eventCount
      }
      event {
        id
        cliSessionId
        hookEventName
        timestamp
        sessionId
        importance
      }
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_APPEND_PROMPT = gql`
  mutation AppendPrompt($channelId: ID!, $workspaceId: ID!, $text: String!, $attachmentIds: [String!], $createNewSession: Boolean, $sessionId: ID) {
    appendPrompt(channelId: $channelId, workspaceId: $workspaceId, text: $text, attachmentIds: $attachmentIds, createNewSession: $createNewSession, sessionId: $sessionId) {
      workspace {
        ...WorkspaceFields
      }
      session {
        id
        workspaceId
        createdAt
        eventCount
      }
      event {
        id
        cliSessionId
        hookEventName
        timestamp
        sessionId
        importance
      }
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_UPDATE_PREVIEW = gql`
  mutation UpdateWorkspacePreview($channelId: ID!, $workspaceId: ID!, $preview: String!) {
    updateWorkspacePreview(channelId: $channelId, workspaceId: $workspaceId, preview: $preview) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

interface UseClaudeWorkspaceActionsOptions {
  activeChannelId: string | null;
  selectedWorkspaceId: string | null;
  selectedWorkspaceRef: RefObject<Workspace | null>;
  selectedWorkspaceIdRef: RefObject<string | null>;
  activeSessionIdRef: RefObject<string | null>;
  sessionEventsRef: RefObject<ServerEvent[]>;
  clearSession: () => Promise<string | null>;
  onWorkspaceCreated: (workspace: Workspace) => void;
  loadSessionEvents: (workspace: Workspace) => Promise<void>;
  upsertWorkspace: (workspace: Workspace) => void;
  setHasWorktree: Dispatch<SetStateAction<boolean | null>>;
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
  getSetupCommands: () => string[];
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
  permissionMode?: string;
}

export function useClaudeWorkspaceActions({
  activeChannelId,
  selectedWorkspaceId,
  selectedWorkspaceRef,
  selectedWorkspaceIdRef,
  activeSessionIdRef,
  sessionEventsRef,
  clearSession,
  onWorkspaceCreated,
  loadSessionEvents,
  upsertWorkspace,
  setHasWorktree,
  updateWorkspaceStatus,
  getSetupCommands,
  getChannelRepoPath,
  getChannelBaseBranch,
  getSystemInstructions,
}: UseClaudeWorkspaceActionsOptions) {
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const [executeAppendPrompt] = useAppendPromptMutation();
  const [executeUpdatePreview] = useUpdateWorkspacePreviewMutation();

  const spawnedWorkspaceIdsRef = useRef(new Set<string>());
  const [activeRunWorkspaceIds, setActiveRunWorkspaceIds] = useState(() => new Set<string>());
  const [pendingRunWorkspaceId, setPendingRunWorkspaceId] = useState<string | null>(
    null,
  );
  const [pendingRunInitialPrompt, setPendingRunInitialPrompt] = useState('');
  const [pendingRunFilePaths, setPendingRunFilePaths] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>('opus');
  const [selectedEffort, setSelectedEffort] = useState<EffortLevel>('high');

  const spawnClaudeForWorkspace = useCallback(
    async (workspaceId: string, prompt: string, options: SpawnOptions) => {
      spawnedWorkspaceIdsRef.current.add(workspaceId);
      setActiveRunWorkspaceIds(prev => { const next = new Set(prev); next.add(workspaceId); return next; });
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.spawnClaude(workspaceId, prompt, repoPath, options.creationCommands, options.resumeSessionId, options.filePaths, options.model, options.effort, options.systemInstructions, options.permissionMode);

        if (!result.success) {
          spawnedWorkspaceIdsRef.current.delete(workspaceId);
          setActiveRunWorkspaceIds(prev => { const next = new Set(prev); next.delete(workspaceId); return next; });
          console.error(`${options.errorPrefix}:`, result.error);
          return false;
        }

        if (options.setHasWorktreeOnSuccess !== false) {
          setHasWorktree(true);
        }

        if (options.statusOnSuccess) {
          await updateWorkspaceStatus(workspaceId, options.statusOnSuccess);
        }

        return true;
      } catch {
        spawnedWorkspaceIdsRef.current.delete(workspaceId);
        setActiveRunWorkspaceIds(prev => { const next = new Set(prev); next.delete(workspaceId); return next; });
        console.error(options.errorPrefix);
        return false;
      }
    },
    [getChannelRepoPath, setHasWorktree, updateWorkspaceStatus],
  );

  const updatePreviewForPendingRun = useCallback(
    async (workspaceId: string, preview: string) => {
      if (!activeChannelId) return;

      try {
        const { data } = await executeUpdatePreview({
          variables: {
            channelId: activeChannelId,
            workspaceId,
            preview,
          },
        });

        if (!data) return;
        upsertWorkspace(data.updateWorkspacePreview as Workspace);
      } catch {
        // Preview updates are best-effort and should not block execution.
      }
    },
    [activeChannelId, executeUpdatePreview, upsertWorkspace],
  );

  const persistPrompt = useCallback(
    async (workspaceId: string, text: string, errorLabel: string, attachmentIds?: string[], createNewSession?: boolean, sessionId?: string) => {
      if (!activeChannelId) return null;

      try {
        const { data } = await executeAppendPrompt({
          variables: {
            channelId: activeChannelId,
            workspaceId,
            text,
            attachmentIds,
            createNewSession,
            sessionId,
          },
        });

        if (!data?.appendPrompt) {
          console.error(errorLabel);
          return null;
        }

        const workspace = data.appendPrompt.workspace as Workspace;
        upsertWorkspace(workspace);
        if (selectedWorkspaceIdRef.current === workspace.id) {
          void loadSessionEvents(workspace);
        }
        return workspace;
      } catch {
        console.error(errorLabel);
        return null;
      }
    },
    [activeChannelId, executeAppendPrompt, loadSessionEvents, selectedWorkspaceIdRef, upsertWorkspace],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      if (!text || !activeChannelId) return false;

      try {
        const { data } = await executeCreateWorkspace({
          variables: {
            channelId: activeChannelId,
            text,
            attachmentIds,
          },
        });

        if (!data?.createWorkspace) return false;

        const workspace = data.createWorkspace.workspace as Workspace;
        upsertWorkspace(workspace);
        onWorkspaceCreated(workspace);
        setPendingRunWorkspaceId(workspace.id);
        setPendingRunInitialPrompt(text);
        setPendingRunFilePaths(filePaths ?? []);
        return true;
      } catch {
        console.error('Failed to create workspace');
        return false;
      }
    },
    [activeChannelId, executeCreateWorkspace, onWorkspaceCreated, upsertWorkspace],
  );

  const runPendingWorkspace = useCallback(
    async (planMode: boolean, promptText: string) => {
      const editedPrompt = promptText.trim();
      if (!pendingRunWorkspaceId || !editedPrompt) return;

      const prompt = editedPrompt;

      const workspaceId = pendingRunWorkspaceId;
      const filePaths = pendingRunFilePaths;
      setPendingRunWorkspaceId(null);
      setPendingRunInitialPrompt('');
      setPendingRunFilePaths([]);

      const setupCommands = getSetupCommands();

      if (setupCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, 'creation');
      }

      await updatePreviewForPendingRun(workspaceId, editedPrompt);

      // Allocate 10 ports for this workspace
      const portResult = await window.traceAPI.allocatePorts(workspaceId, 10);
      const ports = portResult.success && portResult.ports ? portResult.ports : [];

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (ports.length > 0) {
        const portLines = ports.map((p, i) => `TRACE_PORT_${i}=${p}`).join(', ');
        instructionParts.push(`Available ports: ${portLines}`);
      }
      if (userInstructions) instructionParts.push(userInstructions);

      const success = await spawnClaudeForWorkspace(workspaceId, prompt, {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands: setupCommands,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
        systemInstructions: instructionParts.join('\n\n'),
        permissionMode: planMode ? 'plan' : undefined,
      });

      if (!success && setupCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, 'pending');
      }
    },
    [getChannelBaseBranch, getSetupCommands, getSystemInstructions, pendingRunWorkspaceId, pendingRunFilePaths, selectedModel, selectedEffort, spawnClaudeForWorkspace, updateWorkspaceStatus, updatePreviewForPendingRun],
  );

  const autoRunQueuedTicket = useCallback(
    async (workspaceId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      const prompt = runConfig.prompt;

      const creationCommands = getSetupCommands();

      await updatePreviewForPendingRun(workspaceId, runConfig.prompt);

      if (creationCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, 'creation');
      }

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (userInstructions) instructionParts.push(userInstructions);

      const success = await spawnClaudeForWorkspace(workspaceId, prompt, {
        statusOnSuccess: 'in_progress',
        errorPrefix: 'Failed to auto-run queued ticket',
        creationCommands,
        model: runConfig.model,
        effort: runConfig.model !== 'haiku' ? runConfig.effort : undefined,
        systemInstructions: instructionParts.join('\n\n'),
        permissionMode: runConfig.planMode ? 'plan' : undefined,
      });

      if (!success && creationCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, 'pending');
      }
    },
    [getChannelBaseBranch, getSetupCommands, getSystemInstructions, spawnClaudeForWorkspace, updateWorkspaceStatus, updatePreviewForPendingRun],
  );

  const stopClaude = useCallback(async () => {
    if (!selectedWorkspaceId) return;
    await window.traceAPI.stopClaude(selectedWorkspaceId);
    if (selectedWorkspaceRef.current?.status === 'needs_input') {
      await updateWorkspaceStatus(selectedWorkspaceId, 'completed');
    }
  }, [selectedWorkspaceId, selectedWorkspaceRef, updateWorkspaceStatus]);

  const sendThreadMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      const selectedWorkspace = selectedWorkspaceRef.current;
      if (!text || !selectedWorkspace || !activeChannelId) return false;

      const currentSessionId = activeSessionIdRef.current ?? undefined;

      const persisted = await persistPrompt(
        selectedWorkspace.id,
        text,
        'Failed to persist session prompt',
        attachmentIds,
        undefined,
        currentSessionId,
      );
      if (!persisted) return false;

      // If active session has events → resume existing session
      // If active session is empty (just cleared) → spawn fresh
      const hasEvents = (sessionEventsRef.current?.length ?? 0) > 0;
      // Keep "review" status when sending follow-ups — show a spinner instead of switching states
      const spawnOptions: SpawnOptions = {
        statusOnSuccess: selectedWorkspace.status === 'review' ? undefined : 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands: getSetupCommands(),
        filePaths: filePaths && filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
      };

      if (hasEvents) {
        // Resume existing session
        spawnOptions.resumeSessionId = selectedWorkspace.claudeSessionId ?? undefined;
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

      await spawnClaudeForWorkspace(selectedWorkspace.id, text, spawnOptions);
      return true;
    },
    [activeChannelId, activeSessionIdRef, sessionEventsRef, getChannelBaseBranch, getSetupCommands, getSystemInstructions, persistPrompt, selectedWorkspaceRef, selectedModel, selectedEffort, spawnClaudeForWorkspace],
  );

  const sendPlanResponse = useCallback(
    async (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => {
      const selectedWorkspace = selectedWorkspaceRef.current;
      if (!selectedWorkspace || !activeChannelId) return;

      // Keep "review" status — don't transition to in_progress
      const statusOnSuccess = selectedWorkspace.status === 'review' ? undefined : 'in_progress';

      if (mode === 'clear-context') {
        // Build prompt with the plan content for a fresh Claude process
        const implementPrompt = planFilePath
          ? `Implement the following approved plan. The plan file is at ${planFilePath}.\n\n${planContent ?? text}`
          : `Implement the following approved plan:\n\n${planContent ?? text}`;

        // Create a new session and switch to it so SSE events are routed correctly
        const newSessionId = (await clearSession()) ?? undefined;

        const persisted = await persistPrompt(
          selectedWorkspace.id,
          implementPrompt,
          'Failed to persist plan approval prompt',
          undefined,
          undefined,
          newSessionId,
        );
        if (!persisted) return;

        // Spawn a brand new Claude process (no resumeSessionId)
        const baseBranch = getChannelBaseBranch();
        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];
        if (userInstructions) instructionParts.push(userInstructions);

        await spawnClaudeForWorkspace(selectedWorkspace.id, implementPrompt, {
          errorPrefix: 'Failed to spawn claude for plan implementation',
          statusOnSuccess,
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
          systemInstructions: instructionParts.join('\n\n'),
          // No resumeSessionId — fresh process with clear context
        });

      } else if (mode === 'keep-context') {
        const trimmed = text.trim();
        if (!trimmed) return;

        const persisted = await persistPrompt(
          selectedWorkspace.id,
          trimmed,
          'Failed to persist plan response prompt',
        );
        if (!persisted) return;

        await spawnClaudeForWorkspace(selectedWorkspace.id, trimmed, {
          errorPrefix: 'Failed to spawn claude for plan response',
          statusOnSuccess,
          resumeSessionId: selectedWorkspace.claudeSessionId ?? undefined,
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
        });

      } else if (mode === 'revise') {
        const trimmed = text.trim();
        if (!trimmed) return;

        // Persist the clean user text for display in the session
        const persisted = await persistPrompt(
          selectedWorkspace.id,
          trimmed,
          'Failed to persist plan revision prompt',
        );
        if (!persisted) return;

        await spawnClaudeForWorkspace(selectedWorkspace.id, trimmed, {
          errorPrefix: 'Failed to spawn claude for plan revision',
          resumeSessionId: selectedWorkspace.claudeSessionId ?? undefined,
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
          permissionMode: 'plan',
        });
      }
    },
    [activeChannelId, clearSession, getChannelBaseBranch, getSystemInstructions, persistPrompt, selectedWorkspaceRef, selectedModel, selectedEffort, spawnClaudeForWorkspace],
  );

  const mergeToMain = useCallback(async () => {
    const selectedWorkspace = selectedWorkspaceRef.current;
    if (!selectedWorkspace || !activeChannelId) return;

    const baseBranch = getChannelBaseBranch();
    const prompt = `/merge-to-main ${baseBranch}`;
    const persisted = await persistPrompt(
      selectedWorkspace.id,
      prompt,
      'Failed to persist merge-to-main prompt',
    );
    if (!persisted) return;

    await spawnClaudeForWorkspace(selectedWorkspace.id, prompt, {
      errorPrefix: 'Failed to spawn claude for merge-to-main',
      setHasWorktreeOnSuccess: false,
    });
  }, [activeChannelId, getChannelBaseBranch, persistPrompt, selectedWorkspaceRef, spawnClaudeForWorkspace]);

  const markMerged = useCallback(async () => {
    const selectedWorkspace = selectedWorkspaceRef.current;
    if (!selectedWorkspace || !activeChannelId) return;
    if (selectedWorkspace.status !== 'completed') return;
    await updateWorkspaceStatus(selectedWorkspace.id, 'merged');
  }, [activeChannelId, selectedWorkspaceRef, updateWorkspaceStatus]);

  const clearPendingRun = useCallback(() => {
    setPendingRunWorkspaceId(null);
    setPendingRunInitialPrompt('');
    setPendingRunFilePaths([]);
  }, []);

  const isWorkspaceSpawned = useCallback((workspaceId: string) => {
    return spawnedWorkspaceIdsRef.current.has(workspaceId);
  }, []);

  const clearActiveRun = useCallback((workspaceId: string) => {
    setActiveRunWorkspaceIds(prev => {
      if (!prev.has(workspaceId)) return prev;
      const next = new Set(prev);
      next.delete(workspaceId);
      return next;
    });
  }, []);

  return {
    pendingRunWorkspaceId,
    pendingRunInitialPrompt,
    selectedModel,
    selectedEffort,
    setSelectedModel,
    setSelectedEffort,
    sendMessage,
    runPendingWorkspace,
    autoRunQueuedTicket,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    markMerged,
    clearPendingRun,
    isWorkspaceSpawned,
    activeRunWorkspaceIds,
    clearActiveRun,
  };
}
