import { useCallback, useEffect, useRef } from 'react';
import { gql } from '@apollo/client';
import type { Workspace, TicketStatus } from '../types';
import type { PlanResponseMode } from '../stores/claudeRunStore';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import {
  useCreateWorkspaceMutation,
  useAppendPromptMutation,
  useUpdateWorkspacePreviewMutation,
} from './__generated__/useClaudeMessageActions.generated';
import { useClaudeRunStore } from '../stores/claudeRunStore';
import { useThreadStore } from '../stores/threadStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannelContext } from '../context/ChannelContext';
import { useAppUIStore } from '../stores/appUIStore';

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
  baseBranch?: string;
}

interface UseClaudeWorkspaceActionsOptions {
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
  onWorkspaceCreated: (workspace: Workspace) => void;
}

export function useClaudeWorkspaceActions({
  updateWorkspaceStatus,
  onWorkspaceCreated,
}: UseClaudeWorkspaceActionsOptions) {
  const { activeChannelId, enrichedActiveChannel, localConfigs } = useChannelContext();
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const [executeAppendPrompt] = useAppendPromptMutation();
  const [executeUpdatePreview] = useUpdateWorkspacePreviewMutation();

  // Stable refs for channel data to avoid stale closures
  const channelRef = useRef(enrichedActiveChannel);
  channelRef.current = enrichedActiveChannel;
  const activeChannelIdRef = useRef(activeChannelId);
  activeChannelIdRef.current = activeChannelId;
  const localConfigsRef = useRef(localConfigs);
  localConfigsRef.current = localConfigs;

  // Derived channel helpers via refs (stable callbacks)
  const getChannelRepoPath = useCallback(() => channelRef.current?.localRepoPath ?? '', []);
  const getChannelBaseBranch = useCallback(() => channelRef.current?.baseBranch ?? 'main', []);
  const getSetupCommands = useCallback((): string[] => {
    const script = channelRef.current?.setupScript;
    if (!script) return [];
    return script.split('\n').map((l) => l.trim()).filter(Boolean);
  }, []);
  const getSystemInstructions = useCallback((): string | undefined => {
    const chId = activeChannelIdRef.current;
    return chId ? localConfigsRef.current[chId]?.systemInstructions : undefined;
  }, []);

  // Helper: upsert workspace in both workspace store and thread store
  const upsertWorkspace = useCallback((workspace: Workspace) => {
    useWorkspaceStore.getState().upsertWorkspace(workspace);
    useThreadStore.getState().syncSelectedWorkspace(workspace);
  }, []);

  // Clear active runs when switching channels
  useEffect(() => {
    useClaudeRunStore.getState().clearAllActiveRuns();
    useClaudeRunStore.getState().clearPendingRun();
  }, [activeChannelId]);

  const spawnClaudeForWorkspace = useCallback(
    async (workspaceId: string, prompt: string, options: SpawnOptions) => {
      const runStore = useClaudeRunStore.getState();
      runStore.addSpawnedWorkspace(workspaceId);
      runStore.addActiveRun(workspaceId);
      try {
        const repoPath = getChannelRepoPath();
        const baseBranch = options.baseBranch ?? getChannelBaseBranch();
        const result = await window.traceAPI.spawnClaude(workspaceId, prompt, repoPath, options.creationCommands, options.resumeSessionId, options.filePaths, options.model, options.effort, options.systemInstructions, options.permissionMode, baseBranch);

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
    [getChannelBaseBranch, getChannelRepoPath, updateWorkspaceStatus],
  );

  const updatePreviewForPendingRun = useCallback(
    async (workspaceId: string, preview: string) => {
      const chId = activeChannelIdRef.current;
      if (!chId) return;
      try {
        const { data } = await executeUpdatePreview({
          variables: { channelId: chId, workspaceId, preview },
        });
        if (!data) return;
        upsertWorkspace(data.updateWorkspacePreview as Workspace);
      } catch {
        // Preview updates are best-effort
      }
    },
    [executeUpdatePreview, upsertWorkspace],
  );

  const persistPrompt = useCallback(
    async (workspaceId: string, text: string, errorLabel: string, attachmentIds?: string[], createNewSession?: boolean, sessionId?: string) => {
      const chId = activeChannelIdRef.current;
      if (!chId) return null;
      try {
        const { data } = await executeAppendPrompt({
          variables: { channelId: chId, workspaceId, text, attachmentIds, createNewSession, sessionId },
        });
        if (!data?.appendPrompt) {
          console.error(errorLabel);
          return null;
        }
        const workspace = data.appendPrompt.workspace as Workspace;
        upsertWorkspace(workspace);
        if (useThreadStore.getState().selectedWorkspaceId === workspace.id) {
          void useThreadStore.getState().syncActions.loadSessionEvents(workspace);
        }
        return workspace;
      } catch {
        console.error(errorLabel);
        return null;
      }
    },
    [executeAppendPrompt, upsertWorkspace],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      const chId = activeChannelIdRef.current;
      if (!text || !chId) return false;
      try {
        const { data } = await executeCreateWorkspace({
          variables: { channelId: chId, text, attachmentIds },
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
    [executeCreateWorkspace, onWorkspaceCreated, upsertWorkspace],
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

      // Detect handoff: workspace has sessionCount > 1 (previous user already worked on it)
      const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
      const isHandoff = workspace && workspace.sessionCount > 1;

      if (isHandoff) {
        // Handoff pickup: create a new session, include diff context, skip setup commands
        const baseBranch = getChannelBaseBranch();

        // Build diff context from the worktree
        let diffContext = '';
        try {
          const diffResult = await window.traceAPI.getWorktreeDiff(workspaceId, baseBranch);
          if (diffResult.success && diffResult.branchDiff) {
            diffContext = `<trace-internal>\nThis ticket was handed off from another user. Here is the diff of changes made so far:\n\n${diffResult.branchDiff}\n</trace-internal>\n\n`;
          }
        } catch {
          // Diff is best-effort
        }

        const enhancedPrompt = diffContext + editedPrompt;

        // Create a new empty session
        const clearSession = useThreadStore.getState().syncActions.clearSession;
        const newSessionId = (await clearSession()) ?? undefined;

        // Persist prompt in the new session
        const persisted = await persistPrompt(workspaceId, enhancedPrompt, 'Failed to persist handoff prompt', undefined, undefined, newSessionId);
        if (!persisted) return;

        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];

        const portResult = await window.traceAPI.allocatePorts(workspaceId, 10);
        const ports = portResult.success && portResult.ports ? portResult.ports : [];
        if (ports.length > 0) {
          const portLines = ports.map((p: number, i: number) => `TRACE_PORT_${i}=${p}`).join(', ');
          instructionParts.push(`Available ports: ${portLines}`);
        }
        if (userInstructions) instructionParts.push(userInstructions);

        // Spawn Claude fresh (no resumeSessionId), skip setup commands (worktree already exists)
        await spawnClaudeForWorkspace(workspaceId, enhancedPrompt, {
          statusOnSuccess: 'in_progress',
          errorPrefix: 'Failed to spawn claude for handoff pickup',
          creationCommands: [],
          filePaths: filePaths.length > 0 ? filePaths : undefined,
          model: selectedModel,
          effort: selectedModel !== 'haiku' ? selectedEffort : undefined,
          systemInstructions: instructionParts.join('\n\n'),
          permissionMode: planMode ? 'plan' : undefined,
        });
        return;
      }

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
    [getChannelBaseBranch, getSetupCommands, getSystemInstructions, persistPrompt, spawnClaudeForWorkspace, updateWorkspaceStatus, updatePreviewForPendingRun],
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
      const chId = activeChannelIdRef.current;
      if (!text || !selectedWorkspace || !chId) return false;

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
    [getChannelBaseBranch, getSetupCommands, getSystemInstructions, persistPrompt, spawnClaudeForWorkspace],
  );

  const sendPlanResponse = useCallback(
    async (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => {
      const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
      const chId = activeChannelIdRef.current;
      if (!selectedWorkspace || !chId) return;

      const statusOnSuccess = selectedWorkspace.status === 'review' ? undefined : 'in_progress';
      const { selectedModel, selectedEffort } = useClaudeRunStore.getState();

      if (mode === 'clear-context') {
        const implementPrompt = planFilePath
          ? `Implement the following approved plan. The plan file is at ${planFilePath}.\n\n${planContent ?? text}`
          : `Implement the following approved plan:\n\n${planContent ?? text}`;

        const clearSession = useThreadStore.getState().syncActions.clearSession;
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
    [getChannelBaseBranch, getSystemInstructions, persistPrompt, spawnClaudeForWorkspace],
  );

  const mergeToMain = useCallback(async () => {
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    const chId = activeChannelIdRef.current;
    if (!selectedWorkspace || !chId) return;

    const baseBranch = getChannelBaseBranch();
    const prompt = `/merge-to-main ${baseBranch}`;
    const persisted = await persistPrompt(selectedWorkspace.id, prompt, 'Failed to persist merge-to-main prompt');
    if (!persisted) return;

    await spawnClaudeForWorkspace(selectedWorkspace.id, prompt, {
      errorPrefix: 'Failed to spawn claude for merge-to-main',
      setHasWorktreeOnSuccess: false,
    });
  }, [getChannelBaseBranch, persistPrompt, spawnClaudeForWorkspace]);

  const markMerged = useCallback(async () => {
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    const chId = activeChannelIdRef.current;
    if (!selectedWorkspace || !chId) return;
    if (selectedWorkspace.status !== 'completed') return;
    await updateWorkspaceStatus(selectedWorkspace.id, 'merged');
  }, [updateWorkspaceStatus]);

  // Register all workspace actions on the claude run store
  useEffect(() => {
    useClaudeRunStore.getState().registerWorkspaceActions({
      sendMessage,
      runPendingWorkspace,
      autoRunQueuedTicket,
      stopClaude,
      sendThreadMessage,
      sendPlanResponse,
      mergeToMain,
      markMerged,
    });
    return () => useClaudeRunStore.getState().clearWorkspaceActions();
  }, [sendMessage, runPendingWorkspace, autoRunQueuedTicket, stopClaude, sendThreadMessage, sendPlanResponse, mergeToMain, markMerged]);

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
