import { useEffect } from "react";
import { gql } from "@urql/core";
import { asJsonObject } from "@trace/shared";
import { client } from "../../../lib/urql";
import {
  processAiConversationEvent,
  upsertAiTurnFromServer,
} from "../utils/processAiConversationEvent";

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
      parentTurn {
        id
      }
      branchCount
      createdAt
      branch {
        id
      }
    }
  }
`;

// ── Subscription hooks ─────────────────────────────────────────

/**
 * Subscribes to conversation-level events: title changes, visibility changes,
 * branch creation, label updates, etc.
 *
 * This complements the org-wide subscription by providing lower-latency
 * updates for the active conversation viewport. Both paths call the same
 * shared processor, which is idempotent.
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

        const payload = asJsonObject(event.payload) ?? {};
        processAiConversationEvent({
          eventType: event.type,
          payload,
          timestamp: event.timestamp,
          conversationId: event.conversationId,
        });
      });

    return () => subscription.unsubscribe();
  }, [conversationId]);
}

/**
 * Subscribes to new turns for the active branch.
 * Each turn is upserted into the entity store and appended to the branch's turn list.
 * Handles optimistic reconciliation: if a USER turn arrives and there's an optimistic
 * turn in the branch, the optimistic ID is swapped for the real one.
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

        upsertAiTurnFromServer({
          turnId: turn.id,
          branchId: turn.branch.id,
          role: turn.role,
          content: turn.content,
          parentTurnId: turn.parentTurn?.id ?? null,
          branchCount: turn.branchCount,
          createdAt: turn.createdAt,
          timestamp: turn.createdAt,
        });
      });

    return () => subscription.unsubscribe();
  }, [branchId]);
}
