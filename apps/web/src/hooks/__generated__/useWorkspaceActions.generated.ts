import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;

// ---------------------------------------------------------------------------
// Shared fragment
// ---------------------------------------------------------------------------

const WorkspaceFieldsFragmentDoc = gql`
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
// CreateWorkspace
// ---------------------------------------------------------------------------

export type CreateWorkspaceMutationVariables = {
  channelId: string;
  text: string;
  attachmentIds?: string[] | null;
};

type WorkspaceFieldsType = {
  __typename?: "Workspace";
  id: string;
  channelId: string;
  cliSessionId: string;
  userId?: string | null;
  preview?: string | null;
  importance: string;
  status: string;
  summary?: string | null;
  branch?: string | null;
  agentSessionId?: string | null;
  agentType?: string | null;
  createdAt: string;
  sessionCount: number;
  queuedRunConfig?: unknown | null;
  isProductDoc: boolean;
  cliSession?: {
    __typename?: "WorkspaceCliSession";
    sessionId: string;
    cwd?: string | null;
    status: string;
  } | null;
  user?: {
    __typename?: "WorkspaceUser";
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null;
};

type SessionPayload = {
  __typename?: "Session";
  id: string;
  workspaceId: string;
  createdAt: string;
  eventCount: number;
};

type EventPayload = {
  __typename?: "Event";
  id: string;
  cliSessionId: string;
  hookEventName: string;
  timestamp: string;
  sessionId: string;
  importance: string;
};

export type CreateWorkspaceMutation = {
  __typename?: "Mutation";
  createWorkspace: {
    __typename?: "CreateWorkspacePayload";
    workspace: WorkspaceFieldsType;
    session: SessionPayload;
    event?: EventPayload | null;
  };
};

export const CreateWorkspaceDocument = gql`
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
  ${WorkspaceFieldsFragmentDoc}
`;

export function useCreateWorkspaceMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CreateWorkspaceMutation,
    CreateWorkspaceMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    CreateWorkspaceMutation,
    CreateWorkspaceMutationVariables
  >(CreateWorkspaceDocument, options);
}

// ---------------------------------------------------------------------------
// AppendPrompt
// ---------------------------------------------------------------------------

export type AppendPromptMutationVariables = {
  channelId: string;
  workspaceId: string;
  text: string;
  attachmentIds?: string[] | null;
  createNewSession?: boolean | null;
  sessionId?: string | null;
};

export type AppendPromptMutation = {
  __typename?: "Mutation";
  appendPrompt: {
    __typename?: "CreateWorkspacePayload";
    workspace: WorkspaceFieldsType;
    session: SessionPayload;
    event?: EventPayload | null;
  };
};

export const AppendPromptDocument = gql`
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
  ${WorkspaceFieldsFragmentDoc}
`;

export function useAppendPromptMutation(
  baseOptions?: Apollo.MutationHookOptions<
    AppendPromptMutation,
    AppendPromptMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    AppendPromptMutation,
    AppendPromptMutationVariables
  >(AppendPromptDocument, options);
}

// ---------------------------------------------------------------------------
// UpdateWorkspaceStatus
// ---------------------------------------------------------------------------

export type UpdateWorkspaceStatusMutationVariables = {
  channelId: string;
  workspaceId: string;
  status: string;
};

export type UpdateWorkspaceStatusMutation = {
  __typename?: "Mutation";
  updateWorkspaceStatus: WorkspaceFieldsType;
};

export const UpdateWorkspaceStatusDocument = gql`
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
  ${WorkspaceFieldsFragmentDoc}
`;

export function useUpdateWorkspaceStatusMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateWorkspaceStatusMutation,
    UpdateWorkspaceStatusMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateWorkspaceStatusMutation,
    UpdateWorkspaceStatusMutationVariables
  >(UpdateWorkspaceStatusDocument, options);
}
