import { useCallback, useEffect, useRef } from "react";
import { gql } from "@apollo/client";
import type { Workspace, TicketStatus, KanbanTicket } from "../types";
import type { PlanResponseMode } from "../stores/agentRunStore";
import { WORKSPACE_FIELDS } from "../graphql/fragments";
import {
  useCreateWorkspaceMutation,
  useAppendPromptMutation,
  useUpdateWorkspacePreviewMutation,
} from "./__generated__/useAgentMessageActions.generated";
import { useAgentRunStore, getEffortOptions } from "../stores/agentRunStore";
import { useThreadStore } from "../stores/threadStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useChannelContext } from "../context/ChannelContext";
import { useAuth } from "../context/AuthContext";

const GQL_CREATE_WORKSPACE = gql`
  mutation CreateWorkspace(
    $channelId: ID!
    $text: String!
    $attachmentIds: [String!]
    $isProductDoc: Boolean
    $isOrchestrator: Boolean
  ) {
    createWorkspace(
      channelId: $channelId
      text: $text
      attachmentIds: $attachmentIds
      isProductDoc: $isProductDoc
      isOrchestrator: $isOrchestrator
    ) {
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
  mutation AppendPrompt(
    $channelId: ID!
    $workspaceId: ID!
    $text: String!
    $attachmentIds: [String!]
    $createNewSession: Boolean
    $sessionId: ID
  ) {
    appendPrompt(
      channelId: $channelId
      workspaceId: $workspaceId
      text: $text
      attachmentIds: $attachmentIds
      createNewSession: $createNewSession
      sessionId: $sessionId
    ) {
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
  mutation UpdateWorkspacePreview(
    $channelId: ID!
    $workspaceId: ID!
    $preview: String!
  ) {
    updateWorkspacePreview(
      channelId: $channelId
      workspaceId: $workspaceId
      preview: $preview
    ) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

function buildReviewTicketPrompt(baseBranch: string): string {
  return `<trace-internal>
You are a senior software engineer performing a code review on a completed ticket. Your job is to verify the implementation, fix any issues you find, and then merge the work into the project base branch.

## Context

This workspace contains a completed ticket from an autonomous project. The implementation was done in an isolated git worktree branched from: ${baseBranch}

The ticket description (including its Completion Goals) is provided after this trace-internal block.

## Your workflow

### Step 1: Gather context

Run ALL of the following before making any judgments:

1. \`git diff ${baseBranch}...HEAD --stat\` — summary of files changed
2. \`git diff ${baseBranch}...HEAD\` — full diff of all changes
3. \`git log ${baseBranch}..HEAD --oneline\` — commit history
4. Read \`.trace/tickets.json\` — understand this ticket's place in the broader project
5. Read \`.trace/technical-scoping.md\` — understand the planned implementation approach
6. Read \`.trace/product-scoping.md\` if needed for additional product context

### Step 2: Validate against ticket requirements

Compare the diff against the ticket description. Check:

1. **Completion Goals**: The ticket ends with a "## Completion Goals" section. Go through EACH goal individually and verify it is satisfied by the diff. List each goal and mark it PASS or FAIL with a brief explanation.

2. **Missing functionality**: Anything described in the ticket that was NOT implemented? Files that should have been created or modified but weren't?

3. **Extraneous changes**: Changes in the diff NOT related to the ticket? Unrelated refactors, debug artifacts, or modifications to files outside the ticket's scope?

4. **File coverage**: Cross-reference files mentioned in the ticket body and technical scoping with files actually changed.

### Step 3: Quality review

Review the code changes for:

1. **Bugs and logic errors**: Off-by-one, null/undefined handling, race conditions, missing error handling, incorrect conditionals
2. **Security issues**: Exposed secrets, injection vulnerabilities, improper input validation
3. **Code quality**: Naming, duplication, complexity, type safety, consistency with codebase patterns
4. **Edge cases**: Empty states, error states, boundary conditions

### Step 4: Evaluate technical scoping alignment

Compare the implementation against \`.trace/technical-scoping.md\`:

- If the implementation MATCHES the plan: note this and move on.
- If the implementation DIVERGES but the end result correctly achieves the ticket's goals: this is acceptable. Update \`.trace/technical-scoping.md\` to reflect the actual approach, adding a note explaining what changed and why. Commit this update.
- If the implementation diverges AND the result is wrong or incomplete: treat as a failure to fix.

### Step 5: Fix any issues

If you find problems (failed completion goals, bugs, security issues, missing functionality):

1. Fix the issues directly in the code. You have full access to the codebase.
2. Run any available test commands if applicable.
3. Commit your fixes with a clear message describing what was fixed and why.
4. Re-verify the completion goals after your fixes.

If you updated \`.trace/technical-scoping.md\`, commit that change as well.

### Step 6: Merge

Once all completion goals pass and any issues are fixed:

1. Call \`/merge-to-main ${baseBranch}\` to create a PR against the project base branch and merge it.

This will create a GitHub PR, merge it, and clean up the branch.

## Important rules

- You MUST read the full diff before making any judgments. Do not skip this step.
- You MUST check every Completion Goal individually. Do not batch them as "all passed" without verification.
- Be pragmatic, not pedantic. Minor style differences or alternative-but-correct approaches are fine.
- The bar is: "Does this implementation correctly and safely achieve what the ticket asked for?"
- If the diff is empty (no changes), check whether the Completion Goals are ALREADY satisfied by the existing code on the base branch. If the goals are met (e.g., changes were merged via another ticket or already exist), then no implementation is needed — simply state that the goals are already satisfied and finish WITHOUT calling /merge-to-main. The server will handle the status transition automatically.
- If the diff is empty and the Completion Goals are NOT met, the ticket was not implemented — fix the implementation yourself based on the ticket description, then merge.
- If the diff only contains changes to \`.trace/\` or \`.claude/\` directories with no actual implementation, check whether the Completion Goals are already satisfied by existing code. If yes, finish without merging. If not, implement the ticket yourself based on the description, then merge.
- When fixing issues, make minimal targeted fixes. Do not refactor or reorganize working code.
- Always call /merge-to-main when done. The goal is to get this ticket merged into the project branch.
</trace-internal>

Review the following completed ticket, fix any issues, and merge it:

`;
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
  baseBranch?: string;
  isOrchestrator?: boolean;
}

interface UseWorkspaceActionsOptions {
  updateWorkspaceStatus: (
    workspaceId: string,
    status: TicketStatus,
  ) => Promise<void>;
  onWorkspaceCreated: (workspace: Workspace) => void;
}

export function useWorkspaceActions({
  updateWorkspaceStatus,
  onWorkspaceCreated,
}: UseWorkspaceActionsOptions) {
  const { activeChannelId, enrichedActiveChannel, localConfigs } =
    useChannelContext();
  const { user } = useAuth();
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
  const getChannelRepoPath = useCallback(
    () => channelRef.current?.localRepoPath ?? "",
    [],
  );
  const getChannelBaseBranch = useCallback(
    () => channelRef.current?.baseBranch ?? "main",
    [],
  );
  const getSetupCommands = useCallback((): string[] => {
    const script = channelRef.current?.setupScript;
    if (!script) return [];
    return script
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
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
    useAgentRunStore.getState().clearAllActiveRuns();
    useAgentRunStore.getState().clearPendingRun();
  }, [activeChannelId]);

  const spawnAgentForWorkspace = useCallback(
    async (workspaceId: string, prompt: string, options: SpawnOptions) => {
      const runStore = useAgentRunStore.getState();
      runStore.addSpawnedWorkspace(workspaceId);
      runStore.addActiveRun(workspaceId);
      try {
        const repoPath = getChannelRepoPath();
        const baseBranch = options.baseBranch ?? getChannelBaseBranch();
        const agentType = runStore.selectedAgent;

        // Auto-detect orchestrator from the workspace store so every caller
        // is covered without having to pass the flag explicitly.
        const isOrchestrator = options.isOrchestrator ||
          (useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)?.isOrchestrator ?? false);

        const result = await window.traceAPI.spawnAgent({
          agentType,
          workspaceId,
          prompt,
          repoPath,
          creationCommands: isOrchestrator ? undefined : options.creationCommands,
          resumeSessionId: options.resumeSessionId,
          filePaths: options.filePaths,
          model: options.model,
          effort: options.effort,
          systemInstructions: options.systemInstructions,
          permissionMode: isOrchestrator ? "ask" : options.permissionMode,
          baseBranch,
          branchPrefix: user?.githubUsername ?? undefined,
          channelId: activeChannelIdRef.current ?? undefined,
          channelName: channelRef.current?.name ?? undefined,
          isOrchestrator,
          userId: user?.id ?? undefined,
        });

        if (!result.success) {
          useAgentRunStore.getState().removeSpawnedWorkspace(workspaceId);
          useAgentRunStore.getState().clearActiveRun(workspaceId);
          console.error(`${options.errorPrefix}:`, result.error);
          return false;
        }

        if (options.setHasWorktreeOnSuccess !== false && !isOrchestrator) {
          useThreadStore.getState().setHasWorktree(true);
        }

        if (options.statusOnSuccess) {
          await updateWorkspaceStatus(workspaceId, options.statusOnSuccess);
        }

        return true;
      } catch {
        useAgentRunStore.getState().removeSpawnedWorkspace(workspaceId);
        useAgentRunStore.getState().clearActiveRun(workspaceId);
        console.error(options.errorPrefix);
        return false;
      }
    },
    [
      getChannelBaseBranch,
      getChannelRepoPath,
      updateWorkspaceStatus,
      user?.githubUsername,
    ],
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
    async (
      workspaceId: string,
      text: string,
      errorLabel: string,
      attachmentIds?: string[],
      createNewSession?: boolean,
      sessionId?: string,
    ) => {
      const chId = activeChannelIdRef.current;
      if (!chId) return null;
      try {
        const { data } = await executeAppendPrompt({
          variables: {
            channelId: chId,
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
        if (useThreadStore.getState().selectedWorkspaceId === workspace.id) {
          void useThreadStore
            .getState()
            .syncActions.loadSessionEvents(workspace);
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

        // Optimistically populate thread with the initial message so it appears
        // immediately instead of waiting for the debounced loadSessionEvents
        const { session: s, event: e } = data.createWorkspace;
        if (s && e) {
          const store = useThreadStore.getState();
          if (store.selectedWorkspaceId === workspace.id) {
            store.setSessions([
              {
                id: s.id,
                workspaceId: s.workspaceId,
                createdAt: s.createdAt,
                eventCount: s.eventCount,
              },
            ]);
            store.setActiveSessionId(s.id);
            store.setSessionEvents([
              {
                id: e.id,
                cliSessionId: e.cliSessionId,
                hookEventName: "UserPromptSubmit",
                timestamp: e.timestamp,
                sessionId: e.sessionId,
                importance: e.importance,
                toolName: null,
                toolInput: null,
                toolResponse: null,
                toolUseId: null,
                stopHookActive: null,
                lastAssistantMessage: null,
                rawPayload: { prompt: text, source: "ui" },
              },
            ]);
            store.setSessionStatus("ready");
          }
        }

        useAgentRunStore
          .getState()
          .setPendingRun(workspace.id, text, filePaths ?? []);
        return true;
      } catch {
        console.error("Failed to create workspace");
        return false;
      }
    },
    [executeCreateWorkspace, onWorkspaceCreated, upsertWorkspace],
  );

  const createWorkspaceForTicket = useCallback(
    async (ticket: KanbanTicket) => {
      const chId = activeChannelIdRef.current;
      if (!chId) return;
      try {
        const { data } = await executeCreateWorkspace({
          variables: { channelId: chId, text: ticket.title },
        });
        if (!data?.createWorkspace) return;
        const workspace = data.createWorkspace.workspace as Workspace;
        upsertWorkspace(workspace);
        onWorkspaceCreated(workspace);

        // Optimistically populate thread with the ticket title message
        const { session: s, event: e } = data.createWorkspace;
        if (s && e) {
          const store = useThreadStore.getState();
          if (store.selectedWorkspaceId === workspace.id) {
            store.setSessions([
              {
                id: s.id,
                workspaceId: s.workspaceId,
                createdAt: s.createdAt,
                eventCount: s.eventCount,
              },
            ]);
            store.setActiveSessionId(s.id);
            store.setSessionEvents([
              {
                id: e.id,
                cliSessionId: e.cliSessionId,
                hookEventName: "UserPromptSubmit",
                timestamp: e.timestamp,
                sessionId: e.sessionId,
                importance: e.importance,
                toolName: null,
                toolInput: null,
                toolResponse: null,
                toolUseId: null,
                stopHookActive: null,
                lastAssistantMessage: null,
                rawPayload: { prompt: ticket.title, source: "ui" },
              },
            ]);
            store.setSessionStatus("ready");
          }
        }

        useAgentRunStore
          .getState()
          .setPendingRun(workspace.id, ticket.description ?? ticket.title, []);
      } catch {
        console.error("Failed to create workspace for ticket");
      }
    },
    [executeCreateWorkspace, onWorkspaceCreated, upsertWorkspace],
  );

  const createOrchestrator = useCallback(async () => {
    const chId = activeChannelIdRef.current;
    if (!chId) return;

    // Capture channel values upfront so they remain stable across awaits
    const chName = channelRef.current?.name ?? undefined;
    const baseBranch = getChannelBaseBranch();

    // Check for existing orchestrator in this channel
    const existing = useWorkspaceStore
      .getState()
      .workspaces.find((w) => w.isOrchestrator && w.channelId === chId);
    if (existing) {
      // Open the existing orchestrator's thread
      onWorkspaceCreated(existing);
      return;
    }

    const repoPath = getChannelRepoPath();
    if (!repoPath) return;

    let createdWorkspaceId: string | null = null;
    try {
      const { data } = await executeCreateWorkspace({
        variables: {
          channelId: chId,
          text: "",
          isOrchestrator: true,
        },
      });
      if (!data?.createWorkspace) return;
      const workspace = data.createWorkspace.workspace as Workspace;
      createdWorkspaceId = workspace.id;
      upsertWorkspace(workspace);
      onWorkspaceCreated(workspace);

      // Auto-run immediately with a default orchestrator prompt
      const runStore = useAgentRunStore.getState();
      const orchestratorPrompt =
        "You are now active as the orchestrator for this channel. Start by reading the .trace/ folder if it exists, then use list_tickets to understand the current state of work. Analyze the current situation and take action — create tickets, set up dependencies, and get things moving. Do not wait for user instructions.";

      runStore.addSpawnedWorkspace(workspace.id);
      runStore.addActiveRun(workspace.id);

      const result = await window.traceAPI.spawnAgent({
        agentType: runStore.selectedAgent,
        workspaceId: workspace.id,
        prompt: orchestratorPrompt,
        repoPath,
        channelId: chId,
        channelName: chName,
        baseBranch,
        isOrchestrator: true,
        userId: user?.id ?? undefined,
        model: runStore.selectedModel,
        effort: "high",
        permissionMode: "ask",
      });

      if (!result.success) {
        useAgentRunStore.getState().removeSpawnedWorkspace(workspace.id);
        useAgentRunStore.getState().clearActiveRun(workspace.id);
        console.error("Failed to spawn orchestrator:", result.error);
        return;
      }

      await updateWorkspaceStatus(workspace.id, "in_progress");
    } catch {
      if (createdWorkspaceId) {
        useAgentRunStore.getState().removeSpawnedWorkspace(createdWorkspaceId);
        useAgentRunStore.getState().clearActiveRun(createdWorkspaceId);
      }
      console.error("Failed to create orchestrator workspace");
    }
  }, [
    executeCreateWorkspace,
    getChannelRepoPath,
    onWorkspaceCreated,
    updateWorkspaceStatus,
    upsertWorkspace,
    user?.id,
  ]);

  const runPendingWorkspace = useCallback(
    async (
      planMode: boolean,
      promptText: string,
      _attachmentIds?: string[],
      _filePaths?: string[],
    ) => {
      const editedPrompt = promptText.trim();
      const runStore = useAgentRunStore.getState();
      const workspaceId = runStore.pendingRunWorkspaceId;
      const filePaths = runStore.pendingRunFilePaths;
      const { selectedModel, selectedEffort } = runStore;
      if (!workspaceId || !editedPrompt) return;

      useAgentRunStore.getState().clearPendingRun();

      // Detect handoff: workspace has status 'handed_off' (previous user handed it off)
      const workspace = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === workspaceId);
      const isHandoff = workspace && workspace.status === "handed_off";

      if (isHandoff) {
        // Handoff pickup: create a new session, include diff context, skip setup commands
        const baseBranch = getChannelBaseBranch();
        const repoPath = getChannelRepoPath();

        // Ensure the worktree exists from the remote branch
        if (workspace.branch && repoPath) {
          const remoteResult = await window.traceAPI.ensureWorktreeFromRemote(
            workspaceId,
            repoPath,
            workspace.branch,
          );
          if (!remoteResult.success) {
            console.error(
              "Failed to fetch worktree from remote:",
              remoteResult.error,
            );
            // Continue anyway — worktree may already exist locally
          }
        }

        // Build diff context from the worktree
        let diffContext = "";
        try {
          const diffResult = await window.traceAPI.getWorktreeDiff(
            workspaceId,
            baseBranch,
          );
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
        const persisted = await persistPrompt(
          workspaceId,
          enhancedPrompt,
          "Failed to persist handoff prompt",
          undefined,
          undefined,
          newSessionId,
        );
        if (!persisted) return;

        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];

        const portResult = await window.traceAPI.allocatePorts(workspaceId, 10);
        const ports =
          portResult.success && portResult.ports ? portResult.ports : [];
        if (ports.length > 0) {
          const portLines = ports
            .map((p: number, i: number) => `TRACE_PORT_${i}=${p}`)
            .join(", ");
          instructionParts.push(`Available ports: ${portLines}`);
        }
        if (userInstructions) instructionParts.push(userInstructions);

        // Spawn Claude fresh (no resumeSessionId), skip setup commands (worktree already exists)
        await spawnAgentForWorkspace(workspaceId, enhancedPrompt, {
          statusOnSuccess: "in_progress",
          errorPrefix: "Failed to spawn claude for handoff pickup",
          creationCommands: [],
          filePaths: filePaths.length > 0 ? filePaths : undefined,
          model: selectedModel,
          effort:
            getEffortOptions(runStore.selectedAgent, selectedModel).length > 0
              ? selectedEffort
              : undefined,
          systemInstructions: instructionParts.join("\n\n"),
          permissionMode: planMode ? "plan" : undefined,
        });

        // Track that this workspace was picked up from handoff so sendThreadMessage
        // won't try to resume User A's stale CLI session on the first follow-up
        useAgentRunStore.getState().addHandoffPickedUp(workspaceId);
        return;
      }

      // Document workspaces (PRD / tech-scope) don't need channel setup scripts
      const pendingWs = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === workspaceId);
      const isDocWs = pendingWs?.isProductDoc ?? false;
      const isOrchestratorWs = pendingWs?.isOrchestrator ?? false;
      const setupCommands = isDocWs || isOrchestratorWs ? [] : getSetupCommands();
      if (setupCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, "creation");
      }

      await updatePreviewForPendingRun(workspaceId, editedPrompt);

      const portResult = await window.traceAPI.allocatePorts(workspaceId, 10);
      const ports =
        portResult.success && portResult.ports ? portResult.ports : [];

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (ports.length > 0) {
        const portLines = ports
          .map((p: number, i: number) => `TRACE_PORT_${i}=${p}`)
          .join(", ");
        instructionParts.push(`Available ports: ${portLines}`);
      }
      if (userInstructions) instructionParts.push(userInstructions);

      const success = await spawnAgentForWorkspace(workspaceId, editedPrompt, {
        statusOnSuccess: "in_progress",
        errorPrefix: "Failed to spawn claude",
        creationCommands: setupCommands,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort:
          getEffortOptions(runStore.selectedAgent, selectedModel).length > 0
            ? selectedEffort
            : undefined,
        systemInstructions: instructionParts.join("\n\n"),
        permissionMode: planMode ? "plan" : undefined,
        isOrchestrator: isOrchestratorWs || undefined,
      });

      if (!success && setupCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, "pending");
      }
    },
    [
      getChannelBaseBranch,
      getSetupCommands,
      getSystemInstructions,
      persistPrompt,
      spawnAgentForWorkspace,
      updateWorkspaceStatus,
      updatePreviewForPendingRun,
    ],
  );

  const autoRunQueuedTicket = useCallback(
    async (
      workspaceId: string,
      runConfig: {
        prompt: string;
        model: string;
        effort: string;
        planMode: boolean;
        followUp?: boolean;
        interactionMode?: string;
      },
    ) => {
      const isFollowUp = runConfig.followUp === true;
      const isOrchestratorWs = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === workspaceId)?.isOrchestrator ?? false;

      // Follow-up runs skip setup commands and status transitions — the
      // worktree already exists and the message was already appended.
      const creationCommands = isFollowUp || isOrchestratorWs ? [] : getSetupCommands();

      if (!isFollowUp) {
        await updatePreviewForPendingRun(workspaceId, runConfig.prompt);

        if (creationCommands.length > 0) {
          await updateWorkspaceStatus(workspaceId, "creation");
        }
      }

      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (userInstructions) instructionParts.push(userInstructions);

      // For follow-up runs, check if we can resume the existing session
      let resumeSessionId: string | undefined;
      if (isFollowUp) {
        const workspace = useWorkspaceStore
          .getState()
          .workspaces.find((w) => w.id === workspaceId);
        const sessionId = workspace?.agentSessionId;
        if (sessionId && !sessionId.startsWith("trace-local-")) {
          resumeSessionId = sessionId;
        }
      }

      // interactionMode from runConfig overrides planMode
      const permissionMode =
        runConfig.interactionMode ?? (runConfig.planMode ? "plan" : undefined);

      const success = await spawnAgentForWorkspace(
        workspaceId,
        runConfig.prompt,
        {
          statusOnSuccess: "in_progress",
          errorPrefix: isFollowUp
            ? "Failed to run follow-up on ticket"
            : "Failed to auto-run queued ticket",
          creationCommands,
          resumeSessionId,
          model: runConfig.model,
          effort:
            getEffortOptions(
              useAgentRunStore.getState().selectedAgent,
              runConfig.model,
            ).length > 0
              ? runConfig.effort
              : undefined,
          systemInstructions: resumeSessionId
            ? undefined
            : instructionParts.join("\n\n"),
          permissionMode,
          isOrchestrator: isOrchestratorWs || undefined,
        },
      );

      if (!success && creationCommands.length > 0) {
        await updateWorkspaceStatus(workspaceId, "pending");
      }
    },
    [
      getChannelBaseBranch,
      getSetupCommands,
      getSystemInstructions,
      spawnAgentForWorkspace,
      updateWorkspaceStatus,
      updatePreviewForPendingRun,
    ],
  );

  const reviewCompletedTicket = useCallback(
    async (
      workspaceId: string,
      runConfig: {
        prompt: string;
        model: string;
        effort: string;
        planMode: boolean;
      },
    ) => {
      const baseBranch = getChannelBaseBranch();
      const userInstructions = getSystemInstructions();
      const reviewPrompt =
        buildReviewTicketPrompt(baseBranch) + runConfig.prompt;

      const instructionParts = [
        `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
      ];
      if (userInstructions) instructionParts.push(userInstructions);

      // Persist the review prompt so it appears in the workspace thread
      const persisted = await persistPrompt(
        workspaceId,
        reviewPrompt,
        "Failed to persist review prompt",
        undefined,
        true, // createNewSession — review runs as a separate session
      );
      if (!persisted) return;

      // Server already transitioned status to "review" atomically before
      // publishing the event, so no need to call updateWorkspaceStatus here.

      const success = await spawnAgentForWorkspace(workspaceId, reviewPrompt, {
        statusOnSuccess: "in_progress",
        errorPrefix: "Failed to spawn review agent",
        model: runConfig.model,
        effort:
          getEffortOptions(
            useAgentRunStore.getState().selectedAgent,
            runConfig.model,
          ).length > 0
            ? runConfig.effort
            : undefined,
        systemInstructions: instructionParts.join("\n\n"),
      });

      // If spawn failed, revert to completed so it can be retried
      if (!success) {
        await updateWorkspaceStatus(workspaceId, "completed");
      }
    },
    [
      getChannelBaseBranch,
      getSystemInstructions,
      persistPrompt,
      spawnAgentForWorkspace,
      updateWorkspaceStatus,
    ],
  );

  const stopAgent = useCallback(async () => {
    const selectedWorkspaceId = useThreadStore.getState().selectedWorkspaceId;
    if (!selectedWorkspaceId) return;
    await window.traceAPI.stopAgent(selectedWorkspaceId);
    // If the user dismisses a question/plan (status is already needs_input),
    // transition to completed since they don't want to answer.
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    if (selectedWorkspace?.status === "needs_input") {
      await updateWorkspaceStatus(selectedWorkspaceId, "completed");
    }
  }, [updateWorkspaceStatus]);

  const sendThreadMessage = useCallback(
    async (rawText: string, attachmentIds?: string[], filePaths?: string[]) => {
      const text = rawText.trim();
      const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
      const chId = activeChannelIdRef.current;
      if (!text || !selectedWorkspace || !chId) return false;

      const workspaceId = selectedWorkspace.id;
      useAgentRunStore.getState().addActiveRun(workspaceId);

      const currentSessionId =
        useThreadStore.getState().activeSessionId ?? undefined;

      const persisted = await persistPrompt(
        workspaceId,
        text,
        "Failed to persist session prompt",
        attachmentIds,
        undefined,
        currentSessionId,
      );
      if (!persisted) {
        useAgentRunStore.getState().clearActiveRun(workspaceId);
        return false;
      }

      const hasEvents =
        (useThreadStore.getState().sessionEvents?.length ?? 0) > 0;
      const { selectedAgent, selectedModel, selectedEffort } =
        useAgentRunStore.getState();

      // Document workspaces (PRD / tech-scope) don't need channel setup scripts
      const isDocWorkspace = selectedWorkspace.isProductDoc;

      const spawnOptions: SpawnOptions = {
        statusOnSuccess:
          selectedWorkspace.status === "review" ? undefined : "in_progress",
        errorPrefix: "Failed to spawn claude",
        creationCommands: isDocWorkspace ? [] : getSetupCommands(),
        filePaths: filePaths && filePaths.length > 0 ? filePaths : undefined,
        model: selectedModel,
        effort:
          getEffortOptions(selectedAgent, selectedModel).length > 0
            ? selectedEffort
            : undefined,
        isOrchestrator: selectedWorkspace.isOrchestrator || undefined,
      };

      // If this workspace was just picked up from a handoff, don't try to resume
      // User A's CLI session — it doesn't exist on this machine. Start fresh instead.
      // After this first fresh spawn, clear the flag so future messages resume normally.
      const wasHandedOff = useAgentRunStore
        .getState()
        .isHandoffPickedUp(workspaceId);
      const wsSessionId = selectedWorkspace.agentSessionId;
      const canResume =
        hasEvents &&
        !wasHandedOff &&
        !!wsSessionId &&
        !wsSessionId.startsWith("trace-local-");
      if (canResume) {
        spawnOptions.resumeSessionId = wsSessionId;
      } else {
        const baseBranch = getChannelBaseBranch();
        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];
        if (userInstructions) instructionParts.push(userInstructions);
        spawnOptions.systemInstructions = instructionParts.join("\n\n");
      }

      await spawnAgentForWorkspace(workspaceId, text, spawnOptions);

      // After successful fresh spawn, clear the handoff flag — agentSessionId
      // will be updated by the server when events arrive from this new CLI process
      if (wasHandedOff) {
        useAgentRunStore.getState().clearHandoffPickedUp(workspaceId);
      }

      return true;
    },
    [
      getChannelBaseBranch,
      getSetupCommands,
      getSystemInstructions,
      persistPrompt,
      spawnAgentForWorkspace,
    ],
  );

  const sendPlanResponse = useCallback(
    async (
      text: string,
      mode: PlanResponseMode,
      planContent?: string,
      planFilePath?: string,
    ) => {
      const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
      const chId = activeChannelIdRef.current;
      if (!selectedWorkspace || !chId) return;

      const statusOnSuccess =
        selectedWorkspace.status === "review" ? undefined : "in_progress";
      const { selectedAgent, selectedModel, selectedEffort } =
        useAgentRunStore.getState();

      if (mode === "clear-context") {
        const implementPrompt = planFilePath
          ? `Implement the following approved plan. The plan file is at ${planFilePath}.\n\n${planContent ?? text}`
          : `Implement the following approved plan:\n\n${planContent ?? text}`;

        const clearSession = useThreadStore.getState().syncActions.clearSession;
        const newSessionId = (await clearSession()) ?? undefined;

        const persisted = await persistPrompt(
          selectedWorkspace.id,
          implementPrompt,
          "Failed to persist plan approval prompt",
          undefined,
          undefined,
          newSessionId,
        );
        if (!persisted) return;

        const baseBranch = getChannelBaseBranch();
        const userInstructions = getSystemInstructions();
        const instructionParts = [
          `The target branch for this workspace is ${baseBranch}. Use this for actions like creating PRs, merging, bisecting, etc.`,
        ];
        if (userInstructions) instructionParts.push(userInstructions);

        await spawnAgentForWorkspace(selectedWorkspace.id, implementPrompt, {
          errorPrefix: "Failed to spawn claude for plan implementation",
          statusOnSuccess,
          model: selectedModel,
          effort:
            getEffortOptions(selectedAgent, selectedModel).length > 0
              ? selectedEffort
              : undefined,
          systemInstructions: instructionParts.join("\n\n"),
        });
      } else if (mode === "keep-context") {
        const trimmed = text.trim();
        if (!trimmed) return;

        const persisted = await persistPrompt(
          selectedWorkspace.id,
          trimmed,
          "Failed to persist plan response prompt",
        );
        if (!persisted) return;

        const planSessionId = selectedWorkspace.agentSessionId;
        await spawnAgentForWorkspace(selectedWorkspace.id, trimmed, {
          errorPrefix: "Failed to spawn claude for plan response",
          statusOnSuccess,
          resumeSessionId:
            planSessionId && !planSessionId.startsWith("trace-local-")
              ? planSessionId
              : undefined,
          model: selectedModel,
          effort:
            getEffortOptions(selectedAgent, selectedModel).length > 0
              ? selectedEffort
              : undefined,
        });
      } else if (mode === "revise") {
        const trimmed = text.trim();
        if (!trimmed) return;

        const persisted = await persistPrompt(
          selectedWorkspace.id,
          trimmed,
          "Failed to persist plan revision prompt",
        );
        if (!persisted) return;

        const reviseSessionId = selectedWorkspace.agentSessionId;
        await spawnAgentForWorkspace(selectedWorkspace.id, trimmed, {
          errorPrefix: "Failed to spawn claude for plan revision",
          resumeSessionId:
            reviseSessionId && !reviseSessionId.startsWith("trace-local-")
              ? reviseSessionId
              : undefined,
          model: selectedModel,
          effort:
            getEffortOptions(selectedAgent, selectedModel).length > 0
              ? selectedEffort
              : undefined,
          permissionMode: "plan",
        });
      }
    },
    [
      getChannelBaseBranch,
      getSystemInstructions,
      persistPrompt,
      spawnAgentForWorkspace,
    ],
  );

  // --- Orchestrator auto-trigger ---
  // Tracks orchestrator workspace IDs by channel (populated by server events)
  const orchestratorIdsByChannelRef = useRef<Map<string, string>>(new Map());
  // Accumulates reasons per channel while orchestrator is running, so re-trigger includes all changes
  const orchestratorPendingReasonsRef = useRef<Map<string, string[]>>(new Map());

  const resolveOrchestratorId = useCallback(
    (channelId: string, orchestratorWorkspaceId?: string): string | null => {
      // Prefer the server-provided ID (works even if workspace isn't in the store)
      if (orchestratorWorkspaceId) {
        orchestratorIdsByChannelRef.current.set(channelId, orchestratorWorkspaceId);
        return orchestratorWorkspaceId;
      }
      // Check cached ID from a previous server event
      const cached = orchestratorIdsByChannelRef.current.get(channelId);
      if (cached) return cached;
      // Fall back to store lookup (only works for the active channel)
      const fromStore = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.isOrchestrator && w.channelId === channelId);
      return fromStore?.id ?? null;
    },
    [],
  );

  const triggerOrchestrator = useCallback(
    async (reason: string, channelId?: string, orchestratorWorkspaceId?: string) => {
      const chId = channelId ?? activeChannelIdRef.current;
      if (!chId) return;

      const orchId = resolveOrchestratorId(chId, orchestratorWorkspaceId);
      if (!orchId) return;

      // If orchestrator is currently running, queue the reason for later
      const isRunning = useAgentRunStore.getState().activeRunWorkspaceIds.has(orchId);
      if (isRunning) {
        const pending = orchestratorPendingReasonsRef.current;
        if (!pending.has(chId)) pending.set(chId, []);
        pending.get(chId)!.push(reason);
        return;
      }

      const triggerPrompt = `A workspace status has changed: ${reason}. Check the current state of all tickets via list_tickets and take any necessary action. If all work is done, summarize the results.`;

      // Persist the prompt so it appears in the orchestrator thread
      const persisted = await persistPrompt(
        orchId,
        triggerPrompt,
        "Failed to persist orchestrator trigger prompt",
        undefined,
        true, // createNewSession
      );
      if (!persisted) return;

      await spawnAgentForWorkspace(orchId, triggerPrompt, {
        statusOnSuccess: "in_progress",
        errorPrefix: "Failed to spawn orchestrator for status change",
        model: useAgentRunStore.getState().selectedModel,
        effort: "high",
        isOrchestrator: true,
      });
    },
    [resolveOrchestratorId, persistPrompt, spawnAgentForWorkspace],
  );

  // Check for pending orchestrator triggers when a run completes
  const checkPendingOrchestratorTrigger = useCallback(
    (completedWorkspaceId: string) => {
      // Find which channel this orchestrator belongs to
      const pending = orchestratorPendingReasonsRef.current;
      const idsByChannel = orchestratorIdsByChannelRef.current;

      // Look up the channel for this orchestrator ID
      let chId: string | undefined;
      for (const [channelId, orchId] of idsByChannel) {
        if (orchId === completedWorkspaceId) {
          chId = channelId;
          break;
        }
      }
      // Fall back to store lookup for active channel
      if (!chId) {
        const fromStore = useWorkspaceStore
          .getState()
          .workspaces.find((w) => w.id === completedWorkspaceId && w.isOrchestrator);
        if (!fromStore) return;
        chId = fromStore.channelId;
      }

      const reasons = pending.get(chId);
      if (reasons && reasons.length > 0) {
        const summary = reasons.join('; ');
        pending.delete(chId);
        // Small delay to let status updates settle
        setTimeout(() => {
          void triggerOrchestrator(`Status changes while orchestrator was running: ${summary}`, chId);
        }, 2000);
      }
    },
    [triggerOrchestrator],
  );

  const mergeToMain = useCallback(async () => {
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    const chId = activeChannelIdRef.current;
    if (!selectedWorkspace || !chId) return;

    const baseBranch = getChannelBaseBranch();
    const prompt = `/merge-to-main ${baseBranch}`;
    const persisted = await persistPrompt(
      selectedWorkspace.id,
      prompt,
      "Failed to persist merge-to-main prompt",
    );
    if (!persisted) return;

    await spawnAgentForWorkspace(selectedWorkspace.id, prompt, {
      errorPrefix: "Failed to spawn claude for merge-to-main",
      setHasWorktreeOnSuccess: false,
    });
  }, [getChannelBaseBranch, persistPrompt, spawnAgentForWorkspace]);

  const markMerged = useCallback(async () => {
    const selectedWorkspace = useThreadStore.getState().selectedWorkspace;
    const chId = activeChannelIdRef.current;
    if (!selectedWorkspace || !chId) return;
    if (selectedWorkspace.status !== "completed") return;
    await updateWorkspaceStatus(selectedWorkspace.id, "merged");
  }, [updateWorkspaceStatus]);

  // Register all workspace actions on the claude run store
  useEffect(() => {
    useAgentRunStore.getState().registerWorkspaceActions({
      sendMessage,
      runPendingWorkspace,
      autoRunQueuedTicket,
      stopAgent,
      sendThreadMessage,
      sendPlanResponse,
      mergeToMain,
      markMerged,
      createWorkspaceForTicket,
      reviewCompletedTicket,
      createOrchestrator,
      triggerOrchestrator,
      checkPendingOrchestratorTrigger,
    });
    return () => useAgentRunStore.getState().clearWorkspaceActions();
  }, [
    sendMessage,
    runPendingWorkspace,
    autoRunQueuedTicket,
    stopAgent,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    markMerged,
    createWorkspaceForTicket,
    reviewCompletedTicket,
    createOrchestrator,
    triggerOrchestrator,
    checkPendingOrchestratorTrigger,
  ]);

  return {
    sendMessage,
    runPendingWorkspace,
    autoRunQueuedTicket,
    stopAgent,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    markMerged,
    createWorkspaceForTicket,
    reviewCompletedTicket,
    createOrchestrator,
    triggerOrchestrator,
    checkPendingOrchestratorTrigger,
  };
}
