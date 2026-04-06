import { useCallback } from "react";
import { gql } from "@urql/core";
import type { AgentObservability, AiConversationVisibility } from "@trace/gql";
import { client } from "../../../lib/urql";
import { useEntityStore, type AiBranchEntity, type AiTurnEntity } from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

// ── Mutation documents ─────────────────────────────────────────

const CREATE_AI_CONVERSATION_MUTATION = gql`
  mutation CreateAiConversation($organizationId: ID!, $input: CreateAiConversationInput!) {
    createAiConversation(organizationId: $organizationId, input: $input) {
      id
    }
  }
`;

const SEND_TURN_MUTATION = gql`
  mutation SendTurn($branchId: ID!, $content: String!, $clientMutationId: String) {
    sendTurn(branchId: $branchId, content: $content, clientMutationId: $clientMutationId) {
      id
    }
  }
`;

const UPDATE_AI_CONVERSATION_TITLE_MUTATION = gql`
  mutation UpdateAiConversationTitle($conversationId: ID!, $title: String!) {
    updateAiConversationTitle(conversationId: $conversationId, title: $title) {
      id
    }
  }
`;

const SUMMARIZE_BRANCH_MUTATION = gql`
  mutation SummarizeBranch($branchId: ID!) {
    summarizeBranch(branchId: $branchId) {
      id
      branchId
      content
      summarizedTurnCount
      summarizedUpToTurnId
      createdAt
    }
  }
`;

const UPDATE_AI_CONVERSATION_MUTATION = gql`
  mutation UpdateAiConversation($conversationId: ID!, $input: UpdateAiConversationInput!) {
    updateAiConversation(conversationId: $conversationId, input: $input) {
      id
    }
  }
`;

const UPDATE_AGENT_OBSERVABILITY_MUTATION = gql`
  mutation UpdateAgentObservability($conversationId: ID!, $level: AgentObservability!) {
    updateAgentObservability(conversationId: $conversationId, level: $level) {
      id
    }
  }
`;

const LABEL_BRANCH_MUTATION = gql`
  mutation LabelBranch($branchId: ID!, $label: String!) {
    labelBranch(branchId: $branchId, label: $label) {
      id
      label
    }
  }
`;

const FORK_BRANCH_MUTATION = gql`
  mutation ForkBranch($turnId: ID!, $label: String) {
    forkBranch(turnId: $turnId, label: $label) {
      id
      conversation { id }
      parentBranch { id }
      forkTurn { id }
      label
      depth
      createdBy { id }
      createdAt
    }
  }
`;

// ── Mutation hooks ─────────────────────────────────────────────

/** Fire-and-forget: creates a conversation; event stream handles store update */
export function useCreateAiConversation() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  return useCallback(
    async (input: { title?: string; visibility?: AiConversationVisibility }) => {
      if (!activeOrgId) return null;

      const result = await client
        .mutation(CREATE_AI_CONVERSATION_MUTATION, {
          organizationId: activeOrgId,
          input,
        })
        .toPromise();

      if (result.error) {
        console.error("Failed to create AI conversation:", result.error.message);
        return null;
      }

      // Return the ID for navigation — but store update comes from event stream
      return result.data?.createAiConversation?.id as string | undefined;
    },
    [activeOrgId],
  );
}

/**
 * Fire-and-forget with optimistic update: user turn appears immediately.
 *
 * Reconciliation happens in the event stream:
 * org events match via clientMutationId, and branch turns fall back to
 * content/parent-turn matching so the active viewport updates immediately.
 */
export function useSendTurn() {
  return useCallback(async (params: { branchId: string; content: string }) => {
    const { branchId, content } = params;

    const clientMutationId = `ai-turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimisticId = `optimistic-${clientMutationId}`;
    const now = new Date().toISOString();

    const { upsert, patch, remove } = useEntityStore.getState();

    // Get the last turn in the branch to set parentTurnId
    const branch = useEntityStore.getState().aiBranches[branchId];
    const lastTurnId = branch?.turnIds[branch.turnIds.length - 1] ?? null;

    // Optimistically insert user turn
    upsert("aiTurns", optimisticId, {
      id: optimisticId,
      branchId,
      role: "USER",
      content,
      parentTurnId: lastTurnId,
      branchCount: 0,
      createdAt: now,
      _optimistic: true,
      _clientMutationId: clientMutationId,
    } as AiTurnEntity);

    // Append to branch turn list
    if (branch) {
      patch("aiBranches", branchId, {
        turnIds: [...branch.turnIds, optimisticId],
        turnCount: branch.turnCount + 1,
      } as Partial<AiBranchEntity>);
    }

    // Fire mutation — reconciliation happens when the event arrives
    const result = await client
      .mutation(SEND_TURN_MUTATION, {
        branchId,
        content,
        clientMutationId,
      })
      .toPromise();

    if (result.error) {
      console.error("Failed to send turn:", result.error.message);

      // Remove optimistic turn on error
      remove("aiTurns", optimisticId);
      const updatedBranch = useEntityStore.getState().aiBranches[branchId];
      if (updatedBranch) {
        patch("aiBranches", branchId, {
          turnIds: updatedBranch.turnIds.filter((id) => id !== optimisticId),
          turnCount: Math.max(0, updatedBranch.turnCount - 1),
        } as Partial<AiBranchEntity>);
      }
      return null;
    }

    return null;
  }, []);
}

/** Fire-and-forget: updates conversation title; event stream handles store update */
export function useUpdateAiConversationTitle() {
  return useCallback(async (params: { conversationId: string; title: string }) => {
    const result = await client.mutation(UPDATE_AI_CONVERSATION_TITLE_MUTATION, params).toPromise();

    if (result.error) {
      console.error("Failed to update conversation title:", result.error.message);
    }
  }, []);
}

/** Fire-and-forget: triggers branch summarization; event stream handles store update */
export function useSummarizeBranch() {
  return useCallback(async (params: { branchId: string }) => {
    const result = await client.mutation(SUMMARIZE_BRANCH_MUTATION, params).toPromise();

    if (result.error) {
      console.error("Failed to summarize branch:", result.error.message);
      return null;
    }

    return result.data?.summarizeBranch?.id as string | undefined;
  }, []);
}

/** Fire-and-forget: updates conversation fields; event stream handles store update */
export function useUpdateAiConversation() {
  return useCallback(
    async (params: {
      conversationId: string;
      input: {
        title?: string;
        modelId?: string | null;
        systemPrompt?: string | null;
        visibility?: AiConversationVisibility;
      };
    }) => {
      const result = await client
        .mutation(UPDATE_AI_CONVERSATION_MUTATION, params)
        .toPromise();

      if (result.error) {
        console.error("Failed to update conversation:", result.error.message);
      }
    },
    [],
  );
}

/** Fire-and-forget: updates agent observability level; event stream handles store update */
export function useUpdateAgentObservability() {
  return useCallback(
    async (params: { conversationId: string; level: AgentObservability }) => {
      const result = await client
        .mutation(UPDATE_AGENT_OBSERVABILITY_MUTATION, params)
        .toPromise();

      if (result.error) {
        console.error("Failed to update agent observability:", result.error.message);
      }
    },
    [],
  );
}

export function useForkBranch() {
  return useCallback(
    async (params: { turnId: string; label?: string }): Promise<string | null> => {
      const result = await client
        .mutation(FORK_BRANCH_MUTATION, { turnId: params.turnId, label: params.label ?? null })
        .toPromise();

      if (result.error) {
        console.error("Failed to fork branch:", result.error.message);
        return null;
      }

      const data = result.data?.forkBranch as
        | { id: string; conversation: { id: string }; parentBranch: { id: string } | null; forkTurn: { id: string } | null; label: string | null; depth: number; createdBy: { id: string }; createdAt: string }
        | undefined;

      if (!data) return null;

      const { upsert, patch } = useEntityStore.getState();
      upsert("aiBranches", data.id, {
        id: data.id, conversationId: data.conversation.id, parentBranchId: data.parentBranch?.id ?? null,
        forkTurnId: data.forkTurn?.id ?? null, label: data.label, depth: data.depth,
        turnIds: [], childBranchIds: [], turnCount: 0, createdById: data.createdBy.id, createdAt: data.createdAt,
      } as AiBranchEntity);

      if (data.parentBranch?.id) {
        const parentBranch = useEntityStore.getState().aiBranches[data.parentBranch.id];
        if (parentBranch && !parentBranch.childBranchIds.includes(data.id)) {
          patch("aiBranches", data.parentBranch.id, { childBranchIds: [...parentBranch.childBranchIds, data.id] } as Partial<AiBranchEntity>);
        }
      }

      if (data.forkTurn?.id) {
        const forkTurn = useEntityStore.getState().aiTurns[data.forkTurn.id];
        if (forkTurn) {
          patch("aiTurns", data.forkTurn.id, { branchCount: forkTurn.branchCount + 1 } as Partial<AiTurnEntity>);
        }
      }

      useAiConversationUIStore.getState().setActiveBranch(data.conversation.id, data.id);
      return data.id;
    },
    [],
  );
}

/** Fire-and-forget: labels a branch; event stream handles store update */
export function useLabelBranch() {
  return useCallback(async (params: { branchId: string; label: string }) => {
    const result = await client.mutation(LABEL_BRANCH_MUTATION, params).toPromise();

    if (result.error) {
      console.error("Failed to label branch:", result.error.message);
    }
  }, []);
}
