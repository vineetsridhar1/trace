import { useEffect } from "react";
import { gql } from "@urql/core";
import { asJsonObject } from "@trace/shared";
import type { AiConversationVisibility } from "@trace/gql";
import { client } from "../../../lib/urql";
import { useEntityStore, type AiBranchEntity, type AiTurnEntity, type AiConversationEntity } from "../../../stores/entity";

// ── Subscription documents ─────────────────────────────────────

const CONVERSATION_EVENTS_SUBSCRIPTION = gql`
  subscription ConversationEvents($conversationId: ID!) {
    conversationEvents(conversationId: $conversationId) {
      conversationId
      type
      payload
      timestamp
    }
  }
`;

const BRANCH_TURNS_SUBSCRIPTION = gql`
  subscription BranchTurns($branchId: ID!) {
    branchTurns(branchId: $branchId) {
      id
      role
      content
      parentTurn { id }
      branchCount
      createdAt
      branch { id }
    }
  }
`;

// ── Subscription hooks ─────────────────────────────────────────

/**
 * Subscribes to conversation-level events: title changes, visibility changes,
 * branch creation, label updates, etc.
 *
 * This complements the org-wide subscription by providing lower-latency
 * updates for the active conversation viewport.
 */
export function useConversationEventsSubscription(conversationId: string | null) {
  useEffect(() => {
    if (!conversationId) return;

    const subscription = client
      .subscription(CONVERSATION_EVENTS_SUBSCRIPTION, { conversationId })
      .subscribe((result) => {
        if (!result.data?.conversationEvents) return;

        const event = result.data.conversationEvents as {
          conversationId: string;
          type: string;
          payload: Record<string, unknown>;
          timestamp: string;
        };

        const { upsert, patch } = useEntityStore.getState();
        const payload = asJsonObject(event.payload) ?? {};

        switch (event.type) {
          case "ai_conversation_title_updated": {
            patch("aiConversations", event.conversationId, {
              title: payload.title as string,
              updatedAt: (payload.updatedAt as string) ?? event.timestamp,
            } as Partial<AiConversationEntity>);
            break;
          }

          case "ai_conversation_visibility_changed": {
            patch("aiConversations", event.conversationId, {
              visibility: payload.visibility as AiConversationVisibility,
              updatedAt: event.timestamp,
            } as Partial<AiConversationEntity>);
            break;
          }

          case "ai_branch_created": {
            const branchId = payload.branchId as string | undefined;
            if (branchId) {
              const existingBranch = useEntityStore.getState().aiBranches[branchId];
              upsert("aiBranches", branchId, {
                ...(existingBranch ?? {}),
                id: branchId,
                conversationId: event.conversationId,
                parentBranchId: (payload.parentBranchId as string) ?? null,
                forkTurnId: (payload.forkTurnId as string) ?? null,
                label: (payload.label as string) ?? null,
                createdById: payload.createdById as string,
                turnIds: existingBranch?.turnIds ?? [],
                childBranchIds: existingBranch?.childBranchIds ?? [],
                depth: (payload.depth as number) ?? 0,
                turnCount: existingBranch?.turnCount ?? 0,
                createdAt: event.timestamp,
              } as AiBranchEntity);

              // Update conversation branch list
              const conversation = useEntityStore.getState().aiConversations[event.conversationId];
              if (conversation && !conversation.branchIds.includes(branchId)) {
                patch("aiConversations", event.conversationId, {
                  branchIds: [...conversation.branchIds, branchId],
                  branchCount: conversation.branchCount + 1,
                  updatedAt: event.timestamp,
                } as Partial<AiConversationEntity>);
              }

              // Update parent branch child list
              const parentBranchId = payload.parentBranchId as string | undefined;
              if (parentBranchId) {
                const parentBranch = useEntityStore.getState().aiBranches[parentBranchId];
                if (parentBranch && !parentBranch.childBranchIds.includes(branchId)) {
                  patch("aiBranches", parentBranchId, {
                    childBranchIds: [...parentBranch.childBranchIds, branchId],
                  } as Partial<AiBranchEntity>);
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
        }
      });

    return () => subscription.unsubscribe();
  }, [conversationId]);
}

/**
 * Subscribes to new turns for the active branch.
 * Each turn is upserted into the entity store and appended to the branch's turn list.
 */
export function useBranchTurnsSubscription(branchId: string | null) {
  useEffect(() => {
    if (!branchId) return;

    const subscription = client
      .subscription(BRANCH_TURNS_SUBSCRIPTION, { branchId })
      .subscribe((result) => {
        if (!result.data?.branchTurns) return;

        const turn = result.data.branchTurns as {
          id: string;
          role: "USER" | "ASSISTANT";
          content: string;
          parentTurn: { id: string } | null;
          branchCount: number;
          createdAt: string;
          branch: { id: string };
        };

        const { upsert, patch } = useEntityStore.getState();
        const turnBranchId = turn.branch.id;

        // Upsert the turn (reconciles with any optimistic version)
        upsert("aiTurns", turn.id, {
          id: turn.id,
          branchId: turnBranchId,
          role: turn.role,
          content: turn.content,
          parentTurnId: turn.parentTurn?.id ?? null,
          branchCount: turn.branchCount,
          createdAt: turn.createdAt,
          _optimistic: false,
        } as AiTurnEntity);

        // Append to branch turn list if not already present
        const branch = useEntityStore.getState().aiBranches[turnBranchId];
        if (branch && !branch.turnIds.includes(turn.id)) {
          patch("aiBranches", turnBranchId, {
            turnIds: [...branch.turnIds, turn.id],
            turnCount: branch.turnCount + 1,
          } as Partial<AiBranchEntity>);
        }
      });

    return () => subscription.unsubscribe();
  }, [branchId]);
}
