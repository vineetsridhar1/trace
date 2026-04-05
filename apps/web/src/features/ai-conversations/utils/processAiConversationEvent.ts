import type { AiConversationVisibility } from "@trace/gql";
import type { JsonObject } from "@trace/shared";
import {
  useEntityStore,
  type AiConversationEntity,
  type AiBranchEntity,
  type AiTurnEntity,
} from "../../../stores/entity";

/**
 * Shared event processor for AI conversation events.
 * Called from both the org-wide subscription (useOrgEvents) and
 * the scoped conversation subscription (useConversationEventsSubscription).
 *
 * Idempotent — safe to call from both paths for the same event.
 */
export function processAiConversationEvent(
  eventType: string,
  payload: JsonObject,
  timestamp: string,
): void {
  const { upsert, patch } = useEntityStore.getState();

  switch (eventType) {
    case "ai_conversation_created": {
      const conversationId = payload.conversationId as string | undefined;
      if (conversationId) {
        const existing = useEntityStore.getState().aiConversations[conversationId];
        upsert("aiConversations", conversationId, {
          ...(existing ?? {}),
          id: conversationId,
          title: (payload.title as string | undefined) ?? null,
          visibility: (payload.visibility as AiConversationVisibility) ?? "PRIVATE",
          createdById: payload.createdById as string,
          rootBranchId: (payload.rootBranchId as string) ?? "",
          branchIds: existing?.branchIds ?? (payload.rootBranchId ? [payload.rootBranchId as string] : []),
          branchCount: existing?.branchCount ?? 1,
          createdAt: timestamp,
          updatedAt: (payload.updatedAt as string) ?? timestamp,
        } as AiConversationEntity);
      }
      break;
    }

    case "ai_conversation_title_updated": {
      const conversationId = payload.conversationId as string | undefined;
      if (conversationId) {
        patch("aiConversations", conversationId, {
          title: payload.title as string,
          updatedAt: (payload.updatedAt as string) ?? timestamp,
        } as Partial<AiConversationEntity>);
      }
      break;
    }

    case "ai_conversation_visibility_changed": {
      const conversationId = payload.conversationId as string | undefined;
      if (conversationId) {
        patch("aiConversations", conversationId, {
          visibility: payload.visibility as AiConversationVisibility,
          updatedAt: timestamp,
        } as Partial<AiConversationEntity>);
      }
      break;
    }

    case "ai_branch_created": {
      const branchId = payload.branchId as string | undefined;
      const conversationId = payload.conversationId as string | undefined;
      if (branchId && conversationId) {
        const existingBranch = useEntityStore.getState().aiBranches[branchId];
        upsert("aiBranches", branchId, {
          ...(existingBranch ?? {}),
          id: branchId,
          conversationId,
          parentBranchId: (payload.parentBranchId as string) ?? null,
          forkTurnId: (payload.forkTurnId as string) ?? null,
          label: (payload.label as string) ?? null,
          createdById: payload.createdById as string,
          turnIds: existingBranch?.turnIds ?? [],
          childBranchIds: existingBranch?.childBranchIds ?? [],
          depth: (payload.depth as number) ?? 0,
          turnCount: existingBranch?.turnCount ?? 0,
          createdAt: timestamp,
        } as AiBranchEntity);

        // Update parent conversation's branch list
        const conversation = useEntityStore.getState().aiConversations[conversationId];
        if (conversation && !conversation.branchIds.includes(branchId)) {
          patch("aiConversations", conversationId, {
            branchIds: [...conversation.branchIds, branchId],
            branchCount: conversation.branchCount + 1,
            updatedAt: timestamp,
          } as Partial<AiConversationEntity>);
        }

        // Update parent branch's childBranches
        const parentBranchId = payload.parentBranchId as string | undefined;
        if (parentBranchId) {
          const parentBranch = useEntityStore.getState().aiBranches[parentBranchId];
          if (parentBranch && !parentBranch.childBranchIds.includes(branchId)) {
            patch("aiBranches", parentBranchId, {
              childBranchIds: [...parentBranch.childBranchIds, branchId],
            } as Partial<AiBranchEntity>);
          }
        }

        // Update fork turn's branch count
        const forkTurnId = payload.forkTurnId as string | undefined;
        if (forkTurnId) {
          const forkTurn = useEntityStore.getState().aiTurns[forkTurnId];
          if (forkTurn) {
            patch("aiTurns", forkTurnId, {
              branchCount: forkTurn.branchCount + 1,
            } as Partial<AiTurnEntity>);
          }
        }
      }
      break;
    }

    case "ai_branch_labeled": {
      const branchId = payload.branchId as string | undefined;
      if (branchId) {
        patch("aiBranches", branchId, {
          label: payload.label as string,
        } as Partial<AiBranchEntity>);
      }
      break;
    }

    case "ai_turn_created": {
      const turnId = payload.turnId as string | undefined;
      const branchId = payload.branchId as string | undefined;
      const conversationId = payload.conversationId as string | undefined;
      if (turnId && branchId) {
        // Check if there's an optimistic turn to reconcile
        const branch = useEntityStore.getState().aiBranches[branchId];
        const role = payload.role as "USER" | "ASSISTANT";

        if (role === "USER" && branch) {
          // Find and replace the optimistic turn for this branch
          const optimisticId = branch.turnIds.find((id) => id.startsWith("optimistic-"));
          if (optimisticId) {
            // Replace optimistic ID with real ID in branch turn list
            patch("aiBranches", branchId, {
              turnIds: branch.turnIds.map((id) => (id === optimisticId ? turnId : id)),
            } as Partial<AiBranchEntity>);
            // Remove the optimistic turn entity
            useEntityStore.getState().remove("aiTurns", optimisticId);
          }
        }

        // Upsert the real turn (overwrites optimistic if IDs matched, or adds new)
        upsert("aiTurns", turnId, {
          id: turnId,
          branchId,
          role,
          content: (payload.content as string) ?? "",
          parentTurnId: (payload.parentTurnId as string) ?? null,
          branchCount: 0,
          createdAt: (payload.createdAt as string) ?? timestamp,
        } as AiTurnEntity);

        // Append to branch's ordered turn IDs if not already present
        // (Re-read branch since we may have patched it above)
        const updatedBranch = useEntityStore.getState().aiBranches[branchId];
        if (updatedBranch && !updatedBranch.turnIds.includes(turnId)) {
          patch("aiBranches", branchId, {
            turnIds: [...updatedBranch.turnIds, turnId],
            turnCount: updatedBranch.turnCount + 1,
          } as Partial<AiBranchEntity>);
        }

        // Update conversation activity
        if (conversationId) {
          patch("aiConversations", conversationId, {
            updatedAt: timestamp,
          } as Partial<AiConversationEntity>);
        }
      }
      break;
    }
  }
}
