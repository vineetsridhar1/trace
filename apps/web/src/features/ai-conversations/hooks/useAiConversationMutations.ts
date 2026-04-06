import { useCallback } from "react";
import { gql } from "@urql/core";
import type { AiConversationVisibility } from "@trace/gql";
import { client } from "../../../lib/urql";
import { useEntityStore, type AiBranchEntity, type AiTurnEntity } from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";

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

const LABEL_BRANCH_MUTATION = gql`
  mutation LabelBranch($branchId: ID!, $label: String!) {
    labelBranch(branchId: $branchId, label: $label) {
      id
      label
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

/** Fire-and-forget: labels a branch; event stream handles store update */
export function useLabelBranch() {
  return useCallback(async (params: { branchId: string; label: string }) => {
    const result = await client.mutation(LABEL_BRANCH_MUTATION, params).toPromise();

    if (result.error) {
      console.error("Failed to label branch:", result.error.message);
    }
  }, []);
}
