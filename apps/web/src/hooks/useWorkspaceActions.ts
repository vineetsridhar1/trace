import { useCallback } from "react";
import { gql } from "@apollo/client";
import { useAgentRelay } from "./useAgentRelay";
import {
  useCreateWorkspaceMutation,
  useAppendPromptMutation,
  useUpdateWorkspaceStatusMutation,
} from "./__generated__/useWorkspaceActions.generated";

// Re-use the shared workspace fragment so the cache stays in sync.
// When codegen runs for the web app the fragment will be resolved from
// the shared graphql directory; the literal is kept here so the gql tag
// can reference it directly.
const WORKSPACE_FIELDS = gql`
  fragment WorkspaceFields on Workspace {
    id
    channelId
    cliSessionId
    userId
    preview
    importance
    status
    summary
    branch
    agentSessionId
    agentType
    createdAt
    cliSession {
      sessionId
      cwd
      status
    }
    user {
      id
      name
      avatarUrl
    }
    sessionCount
    queuedRunConfig
    isProductDoc
  }
`;

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------

const _GQL_CREATE_WORKSPACE = gql`
  mutation CreateWorkspace(
    $channelId: ID!
    $text: String!
    $attachmentIds: [String!]
  ) {
    createWorkspace(
      channelId: $channelId
      text: $text
      attachmentIds: $attachmentIds
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

const _GQL_APPEND_PROMPT = gql`
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

const _GQL_UPDATE_WORKSPACE_STATUS = gql`
  mutation UpdateWorkspaceStatus(
    $channelId: ID!
    $workspaceId: ID!
    $status: String!
  ) {
    updateWorkspaceStatus(
      channelId: $channelId
      workspaceId: $workspaceId
      status: $status
    ) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateWorkspaceParams {
  channelId: string;
  prompt: string;
}

export interface CreateWorkspaceAndSpawnParams extends CreateWorkspaceParams {
  model?: string;
  effort?: string;
  planMode?: boolean;
}

export interface WorkspaceActions {
  createWorkspace: (
    params: CreateWorkspaceParams,
  ) => Promise<{ workspaceId: string | null; error?: string }>;

  createWorkspaceAndSpawn: (
    params: CreateWorkspaceAndSpawnParams,
  ) => Promise<{ workspaceId: string | null; error?: string }>;

  startWorkspace: (params: {
    workspaceId: string;
    prompt: string;
    channelId: string;
    model?: string;
    effort?: string;
    planMode?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;

  stopCurrentAgent: (
    workspaceId: string,
  ) => Promise<{ success: boolean; error?: string }>;

  sendMessage: (
    workspaceId: string,
    prompt: string,
    channelId: string,
    model?: string,
    effort?: string,
    planMode?: boolean,
  ) => Promise<{ success: boolean; error?: string }>;

  switchMode: (
    workspaceId: string,
    channelId: string,
    mode: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspaceActions(): WorkspaceActions {
  const { spawnAgent, stopAgent } = useAgentRelay();
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const [executeAppendPrompt] = useAppendPromptMutation();
  const [executeUpdateStatus] = useUpdateWorkspaceStatusMutation();

  const createWorkspace = useCallback(
    async (
      params: CreateWorkspaceParams,
    ): Promise<{ workspaceId: string | null; error?: string }> => {
      try {
        const { data } = await executeCreateWorkspace({
          variables: {
            channelId: params.channelId,
            text: params.prompt,
          },
        });

        if (!data?.createWorkspace) {
          return { workspaceId: null, error: "Failed to create workspace" };
        }

        return { workspaceId: data.createWorkspace.workspace.id };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error creating workspace";
        return { workspaceId: null, error: message };
      }
    },
    [executeCreateWorkspace],
  );

  const createWorkspaceAndSpawn = useCallback(
    async (
      params: CreateWorkspaceAndSpawnParams,
    ): Promise<{ workspaceId: string | null; error?: string }> => {
      const result = await createWorkspace(params);
      if (!result.workspaceId) return result;

      const spawnResult = await spawnAgent({
        workspaceId: result.workspaceId,
        prompt: params.prompt,
        channelId: params.channelId,
        model: params.model,
        effort: params.effort,
        planMode: params.planMode,
      });

      if (!spawnResult.success) {
        return { workspaceId: result.workspaceId, error: spawnResult.error };
      }

      return { workspaceId: result.workspaceId };
    },
    [createWorkspace, spawnAgent],
  );

  const startWorkspace = useCallback(
    async (params: {
      workspaceId: string;
      prompt: string;
      channelId: string;
      model?: string;
      effort?: string;
      planMode?: boolean;
    }): Promise<{ success: boolean; error?: string }> => {
      return spawnAgent(params);
    },
    [spawnAgent],
  );

  const stopCurrentAgent = useCallback(
    async (
      workspaceId: string,
    ): Promise<{ success: boolean; error?: string }> => {
      return stopAgent(workspaceId);
    },
    [stopAgent],
  );

  const sendMessage = useCallback(
    async (
      workspaceId: string,
      prompt: string,
      channelId: string,
      model?: string,
      effort?: string,
      planMode?: boolean,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const { data } = await executeAppendPrompt({
          variables: {
            channelId,
            workspaceId,
            text: prompt,
          },
        });

        if (!data?.appendPrompt) {
          return { success: false, error: "Failed to append prompt" };
        }

        const result = await spawnAgent({
          workspaceId,
          prompt,
          channelId,
          model,
          effort,
          planMode,
        });

        return { success: result.success, error: result.error };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error sending message";
        return { success: false, error: message };
      }
    },
    [executeAppendPrompt, spawnAgent],
  );

  const switchMode = useCallback(
    async (
      workspaceId: string,
      channelId: string,
      mode: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const { data } = await executeUpdateStatus({
          variables: {
            channelId,
            workspaceId,
            status: mode,
          },
        });

        if (!data?.updateWorkspaceStatus) {
          return { success: false, error: "Failed to update workspace status" };
        }

        return { success: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error switching mode";
        return { success: false, error: message };
      }
    },
    [executeUpdateStatus],
  );

  return {
    createWorkspace,
    createWorkspaceAndSpawn,
    startWorkspace,
    stopCurrentAgent,
    sendMessage,
    switchMode,
  };
}
