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
  mutation SendTurn($branchId: ID!, $content: String!) {
    sendTurn(branchId: $branchId, content: $content) {
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

/** Fire-and-forget with optimistic update: user turn appears immediately */
export function useSendTurn() {
  const userId = useAuthStore((s) => s.user?.id);

  return useCallback(
    async (params: { branchId: string; content: string }) => {
      const { branchId, content } = params;

      // Generate an optimistic turn ID
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
      } as AiTurnEntity);

      // Append to branch turn list
      if (branch) {
        patch("aiBranches", branchId, {
          turnIds: [...branch.turnIds, optimisticId],
          turnCount: branch.turnCount + 1,
        } as Partial<AiBranchEntity>);
      }

      // Fire mutation
      const result = await client
        .mutation(SEND_TURN_MUTATION, { branchId, content })
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

      // The real turn will arrive via branchTurns subscription or org events.
      // When ai_turn_created event arrives, the optimistic turn remains in the list
      // alongside the real one. We need to reconcile: swap optimistic → real.
      // We do this by watching for the next USER turn event on this branch.
      const realTurnId = result.data?.sendTurn?.id as string | undefined;
      if (realTurnId && realTurnId !== optimisticId) {
        // Replace optimistic ID in branch turn list with real ID
        const currentBranch = useEntityStore.getState().aiBranches[branchId];
        if (currentBranch) {
          patch("aiBranches", branchId, {
            turnIds: currentBranch.turnIds.map((id) => (id === optimisticId ? realTurnId : id)),
          } as Partial<AiBranchEntity>);
        }
        // Remove the optimistic turn entity
        remove("aiTurns", optimisticId);
      }

      return realTurnId ?? null;
    },
    [userId],
  );
}

/** Fire-and-forget: updates conversation title; event stream handles store update */
export function useUpdateAiConversationTitle() {
  return useCallback(
    async (params: { conversationId: string; title: string }) => {
      const result = await client
        .mutation(UPDATE_AI_CONVERSATION_TITLE_MUTATION, params)
        .toPromise();

      if (result.error) {
        console.error("Failed to update conversation title:", result.error.message);
      }
    },
    [],
  );
}
