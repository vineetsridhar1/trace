import { useCallback, useEffect } from 'react';
import { gql } from '@apollo/client';
import type { Workspace, TicketStatus } from '../types';
import type { PlanResponseMode } from '../context/ClaudeActionsContext';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import {
  useCreateWorkspaceMutation,
  useAppendPromptMutation,
  useUpdateWorkspacePreviewMutation,
} from './__generated__/useClaudeMessageActions.generated';
import { useClaudeRunStore } from '../stores/claudeRunStore';
import { useThreadStore } from '../stores/threadStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

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

interface UseClaudeWorkspaceActionsOptions {
  activeChannelId: string | null;
  onWorkspaceCreated: (workspace: Workspace) => void;
  loadSessionEvents: (workspace: Workspace) => Promise<void>;
  upsertWorkspace: (workspace: Workspace) => void;
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
  getSetupCommands: () => string[];
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  getSystemInstructions: () => string | undefined;
  clearSession: () => Promise<string | null>;
}

export function useClaudeWorkspaceActions({
  activeChannelId,
  onWorkspaceCreated,
  loadSessionEvents,
  upsertWorkspace,
  updateWorkspaceStatus,
  getSetupCommands,
  getChannelRepoPath,
  getChannelBaseBranch,
  getSystemInstructions,
  clearSession,
}: UseClaudeWorkspaceActionsOptions) {
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const [executeAppendPrompt] = useAppendPromptMutation();
  const [executeUpdatePreview] = useUpdateWorkspacePreviewMutation();

  // Clear active runs when switching channels
  useEffect(() => {
    useClaudeRunStore.getState().clearAllActiveRuns();
  }, [activeChannelId]);

  const spawnClaudeForWorkspace = useCallback(
    async (workspaceId: string, prompt: string, options: SpawnOptions) => {
      const runStore = useClaudeRunStore.getState();
      runStore.addSpawnedWorkspace(workspaceId);
      runStore.addActiveRun(workspaceId);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.spawnClaude(workspaceId, prompt, repoPath, options.creationCommands, options.resumeSessionId, options.filePaths, options.model, options.effort, options.systemInstructions, options.permissionMode);

        if (!result.success) {
          useClaudeRunStore.getState().removeSpawnedWorkspace(workspaceId);
          useClaudeRunStore.getState().clearActiveRun(workspaceId);
          console.error(`${options.errorPrefix}:`, result.error);
          return false;
        }

        if (options.setHasWorktreeOnSuccess !== false) {
          useThreadStore.getState().setHasWorktree(true);
        }

        if (options.statusOnSuccess) {
          await updateWorkspaceStatus(workspaceId, options.statusOnSuccess);
        }

        return true;
      } catch {
        useClaudeRunStore.getState().removeSpawnedWorkspace(workspaceId);
        useClaudeRunStore.getState().clearActiveRun(workspaceId);
        console.error(options.errorPrefix);
        return false;
      }
    },
    [getChannelRepoPath, updateWorkspaceStatus],
  );

  const updatePreviewForPendingRun = useCallback(
    async (workspaceId: string, preview: string) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeUpdatePreview({
          variables: { channelId: activeChannelId, workspaceId, preview },
        });
        if (!data) return;
        upsertWorkspace(data.updateWorkspacePreview as Workspace);
      } catch {
        // Preview updates are best-effort
      }
    },
    [activeChannelId, executeUpdatePreview, upsertWorkspace],
  );

  const persistPrompt = useCallback(
    async (workspaceId: string, text: string, errorLabel: string, attachmentIds?: string[], createNewSession?: boolean, sessionId?: string) => {
      if (!activeChannelId) return null;
      try {
        const { data } = await executeAppendPrompt({
          variables: { channelId: activeChannelId, workspaceId, text, attachmentIds, createNewSession, sessionId },
        });
        if (!data?.appendPrompt) {
          console.error(errorLabel);
          return null;
        }
        const workspace = data.appendPrompt.workspace as Workspace;
        upsertWorkspace(workspace);
        if (useThreadStore.getState().selectedWorkspaceId === workspace.id) {
          void loadSessionEvents(workspace);
        }
        return workspace;
      } catch {
        console.error(errorLabel);
        return null;
      }
    },
    [activeChannelId, executeAppendPrompt, loadSessionEvents, upsertWorkspace],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      if (!text || !activeChannelId) return false;
      try {
        const { data } = await executeCreateWorkspace({
          variables: { channelId: activeChannelId, text, attachmentIds },
        });
        if (!data?.createWorkspace) return false;
        const workspace = data.createWorkspace.workspace as Workspace;
        upsertWorkspace(workspace);
        onWorkspaceCreated(workspace);
        useClaudeRunStore.getState().setPendingRun(workspace.id, text, filePaths ?? []);
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
      const runStore = useClaudeRunStore.getState();
      const workspaceId = runStore.pendingRunWorkspaceId;
      const filePaths = runStore.pendingRunFilePaths;
      const { selectedModel, selectedEffort } = runStore;
      if (!workspaceId || !editedPrompt) return;

      useClaudeRunStore.getState().clearPendingRun();

      const setupCommands = getSetupCommands();
      if (setupCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, 'creation');
      }

      await updatePreviewForPendingRun(workspaceId, editedPrompt);

      const portResult = await window.traceAPI.allocatePorts(workspaceId, 10);
      const ports = portResult.success && portResult.ports ? portResult.ports : [];

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (ports.length > 0) {
        const portLines = ports.map((p: number, i: number) => `TRACE_PORT_${i}=${p}`).join(', ');
        instructionParts.push(`Available ports: ${portLines}`);
      }
      if (userInstructions) instructionParts.push(userInstructions);

      const success = await spawnClaudeForWorkspace(workspaceId, editedPrompt, {
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
    [getChannelBaseBranch, getSetupCommands, getSystemInstructions, spawnClaudeForWorkspace, updateWorkspaceStatus, updatePreviewForPendingRun],
  );

  const autoRunQueuedTicket = useCallback(
    async (workspaceId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
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

      const success = await spawnClaudeForWorkspace(workspaceId, runConfig.prompt, {
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
    const selectedWorkspaceId = useThreadStore.getState().selectedWorkspaceId;
    if (!selectedWorkspaceId) return;
    await window.traceAPI.stopClaude(selectedWorkspaceId);
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    if (selectedWorkspace?.status === 'needs_input') {
      await updateWorkspaceStatus(selectedWorkspaceId, 'completed');
    }
  }, [updateWorkspaceStatus]);

  const sendThreadMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
      if (!text || !selectedWorkspace || !activeChannelId) return false;

      const workspaceId = selectedWorkspace.id;
      useClaudeRunStore.getState().addActiveRun(workspaceId);

      const currentSessionId = useThreadStore.getState().activeSessionId ?? undefined;

      const persisted = await persistPrompt(workspaceId, text, 'Failed to persist session prompt', attachmentIds, undefined, currentSessionId);
      if (!persisted) {
        useClaudeRunStore.getState().clearActiveRun(workspaceId);
        return false;
      }

      const hasEvents = (useThreadStore.getState().sessionEvents?.length ?? 0) > 0;
      const { selectedModel, selectedEffort } = useClaudeRunStore.getState();

      const spawnOptions: SpawnOptions = {
        statusOnSuccess: selectedWorkspace.status === 'review' ? undefined : 'in_progress',
        errorPrefix: 'Failed to spawn claude',
        creationCommands: getSetupCommands(),
        filePaths: filePaths && filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
      };

      if (hasEvents) {
        spawnOptions.resumeSessionId = selectedWorkspace.claudeSessionId ?? undefined;
      } else {
        const baseBranch = getChannelBaseBranch();
        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];
        if (userInstructions) instructionParts.push(userInstructions);
        spawnOptions.systemInstructions = instructionParts.join('\n\n');
      }

      await spawnClaudeForWorkspace(workspaceId, text, spawnOptions);
      return true;
    },
    [activeChannelId, getChannelBaseBranch, getSetupCommands, getSystemInstructions, persistPrompt, spawnClaudeForWorkspace],
  );

  const sendPlanResponse = useCallback(
    async (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => {
      const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
      if (!selectedWorkspace || !activeChannelId) return;

      const statusOnSuccess = selectedWorkspace.status === 'review' ? undefined : 'in_progress';
      const { selectedModel, selectedEffort } = useClaudeRunStore.getState();

      if (mode === 'clear-context') {
        const implementPrompt = planFilePath
          ? `Implement the following approved plan. The plan file is at ${planFilePath}.\n\n${planContent ?? text}`
          : `Implement the following approved plan:\n\n${planContent ?? text}`;

        const newSessionId = (await clearSession()) ?? undefined;

        const persisted = await persistPrompt(selectedWorkspace.id, implementPrompt, 'Failed to persist plan approval prompt', undefined, undefined, newSessionId);
        if (!persisted) return;

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
        });
      } else if (mode === 'keep-context') {
        const trimmed = text.trim();
        if (!trimmed) return;

        const persisted = await persistPrompt(selectedWorkspace.id, trimmed, 'Failed to persist plan response prompt');
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

        const persisted = await persistPrompt(selectedWorkspace.id, trimmed, 'Failed to persist plan revision prompt');
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
    [activeChannelId, clearSession, getChannelBaseBranch, getSystemInstructions, persistPrompt, spawnClaudeForWorkspace],
  );

  const mergeToMain = useCallback(async () => {
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    if (!selectedWorkspace || !activeChannelId) return;

    const baseBranch = getChannelBaseBranch();
    const prompt = `/merge-to-main ${baseBranch}`;
    const persisted = await persistPrompt(selectedWorkspace.id, prompt, 'Failed to persist merge-to-main prompt');
    if (!persisted) return;

    await spawnClaudeForWorkspace(selectedWorkspace.id, prompt, {
      errorPrefix: 'Failed to spawn claude for merge-to-main',
      setHasWorktreeOnSuccess: false,
    });
  }, [activeChannelId, getChannelBaseBranch, persistPrompt, spawnClaudeForWorkspace]);

  const markMerged = useCallback(async () => {
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    if (!selectedWorkspace || !activeChannelId) return;
    if (selectedWorkspace.status !== 'completed') return;
    await updateWorkspaceStatus(selectedWorkspace.id, 'merged');
  }, [activeChannelId, updateWorkspaceStatus]);

  return {
    sendMessage,
    runPendingWorkspace,
    autoRunQueuedTicket,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    markMerged,
  };
}
