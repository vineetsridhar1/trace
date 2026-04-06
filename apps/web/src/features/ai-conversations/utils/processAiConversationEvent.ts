import type { AiConversationVisibility } from "@trace/gql";
import type { JsonObject } from "@trace/shared";
import {
  useEntityStore,
  type AiConversationEntity,
  type AiBranchEntity,
  type AiTurnEntity,
} from "../../../stores/entity";

interface ProcessAiConversationEventInput {
  eventType: string;
  payload: JsonObject;
  timestamp: string;
  conversationId?: string;
}

interface IncomingAiTurn {
  turnId: string;
  branchId: string;
  conversationId?: string;
  role: "USER" | "ASSISTANT";
  content: string;
  parentTurnId: string | null;
  branchCount?: number;
  createdAt: string;
  timestamp: string;
  clientMutationId?: string;
}

function resolveConversationId(
  payload: JsonObject,
  fallbackConversationId?: string,
): string | undefined {
  return (payload.conversationId as string | undefined) ?? fallbackConversationId;
}

function findMatchingOptimisticTurnId(params: {
  branchId: string;
  clientMutationId?: string;
  content: string;
  parentTurnId: string | null;
}): string | undefined {
  const state = useEntityStore.getState();
  const branch = state.aiBranches[params.branchId];
  if (!branch) return undefined;

  const optimisticIds = branch.turnIds.filter((id) => state.aiTurns[id]?._optimistic);
  if (optimisticIds.length === 0) return undefined;

  if (params.clientMutationId) {
    const byCorrelationId = optimisticIds.find(
      (id) => state.aiTurns[id]?._clientMutationId === params.clientMutationId,
    );
    if (byCorrelationId) return byCorrelationId;
  }

  const byContentAndParent = optimisticIds.find((id) => {
    const optimisticTurn = state.aiTurns[id];
    return (
      optimisticTurn?.content === params.content &&
      optimisticTurn.parentTurnId === params.parentTurnId
    );
  });
  if (byContentAndParent) return byContentAndParent;

  return optimisticIds.length === 1 ? optimisticIds[0] : undefined;
}

function reconcileOptimisticTurn(turn: IncomingAiTurn): void {
  if (turn.role !== "USER") return;

  const optimisticId = findMatchingOptimisticTurnId({
    branchId: turn.branchId,
    clientMutationId: turn.clientMutationId,
    content: turn.content,
    parentTurnId: turn.parentTurnId,
  });
  if (!optimisticId) return;

  const { patch, remove } = useEntityStore.getState();
  const branch = useEntityStore.getState().aiBranches[turn.branchId];
  if (!branch) return;

  patch("aiBranches", turn.branchId, {
    turnIds: branch.turnIds.map((id) => (id === optimisticId ? turn.turnId : id)),
  } as Partial<AiBranchEntity>);
  remove("aiTurns", optimisticId);
}

export function upsertAiTurnFromServer(turn: IncomingAiTurn): void {
  const { upsert, patch } = useEntityStore.getState();

  reconcileOptimisticTurn(turn);

  const existingTurn = useEntityStore.getState().aiTurns[turn.turnId];
  upsert("aiTurns", turn.turnId, {
    ...(existingTurn ?? {}),
    id: turn.turnId,
    branchId: turn.branchId,
    role: turn.role,
    content: turn.content,
    parentTurnId: turn.parentTurnId,
    branchCount: turn.branchCount ?? existingTurn?.branchCount ?? 0,
    createdAt: turn.createdAt,
    _optimistic: undefined,
    _clientMutationId: undefined,
  } as AiTurnEntity);

  const branch = useEntityStore.getState().aiBranches[turn.branchId];
  if (branch && !branch.turnIds.includes(turn.turnId)) {
    patch("aiBranches", turn.branchId, {
      turnIds: [...branch.turnIds, turn.turnId],
      turnCount: branch.turnIds.length + 1,
    } as Partial<AiBranchEntity>);
  }

  if (turn.conversationId) {
    patch("aiConversations", turn.conversationId, {
      updatedAt: turn.timestamp,
    } as Partial<AiConversationEntity>);
  }
}

/**
 * Shared event processor for AI conversation events.
 * Called from both the org-wide subscription (useOrgEvents) and
 * the scoped conversation subscription (useConversationEventsSubscription).
 *
 * Idempotent — safe to call from both paths for the same event.
 */
export function processAiConversationEvent({
  eventType,
  payload,
  timestamp,
  conversationId: fallbackConversationId,
}: ProcessAiConversationEventInput): void {
  const { upsert, patch } = useEntityStore.getState();

  switch (eventType) {
    case "ai_conversation_created": {
      const conversationId = resolveConversationId(payload, fallbackConversationId);
      if (conversationId) {
        const existing = useEntityStore.getState().aiConversations[conversationId];
        const rootBranchId =
          (payload.rootBranchId as string | undefined) ?? existing?.rootBranchId ?? "";
        const branchIds = existing?.branchIds ?? (rootBranchId ? [rootBranchId] : []);

        upsert("aiConversations", conversationId, {
          ...(existing ?? {}),
          id: conversationId,
          title: (payload.title as string | undefined) ?? null,
          visibility: (payload.visibility as AiConversationVisibility) ?? "PRIVATE",
          createdById: payload.createdById as string,
          rootBranchId,
          branchIds,
          branchCount: existing?.branchCount ?? branchIds.length,
          forkedFromConversationId:
            (payload.forkedFromConversationId as string | undefined) ??
            existing?.forkedFromConversationId ??
            null,
          forkedFromBranchId:
            (payload.forkedFromBranchId as string | undefined) ??
            existing?.forkedFromBranchId ??
            null,
          createdAt: timestamp,
          updatedAt: (payload.updatedAt as string) ?? timestamp,
        } as AiConversationEntity);
      }
      break;
    }

    case "ai_conversation_title_updated": {
      const conversationId = resolveConversationId(payload, fallbackConversationId);
      if (conversationId) {
        patch("aiConversations", conversationId, {
          title: payload.title as string,
          updatedAt: (payload.updatedAt as string) ?? timestamp,
        } as Partial<AiConversationEntity>);
      }
      break;
    }

    case "ai_conversation_visibility_changed": {
      const conversationId = resolveConversationId(payload, fallbackConversationId);
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
      const conversationId = resolveConversationId(payload, fallbackConversationId);
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
          depth: (payload.depth as number) ?? existingBranch?.depth ?? 0,
          turnCount: existingBranch?.turnCount ?? 0,
          createdAt: timestamp,
        } as AiBranchEntity);

        const conversation = useEntityStore.getState().aiConversations[conversationId];
        if (conversation && !conversation.branchIds.includes(branchId)) {
          const nextBranchIds = [...conversation.branchIds, branchId];
          const parentBranchId = (payload.parentBranchId as string | undefined) ?? null;
          patch("aiConversations", conversationId, {
            branchIds: nextBranchIds,
            branchCount: nextBranchIds.length,
            rootBranchId:
              conversation.rootBranchId || (!parentBranchId ? branchId : conversation.rootBranchId),
            updatedAt: timestamp,
          } as Partial<AiConversationEntity>);
        }

        const parentBranchId = payload.parentBranchId as string | undefined;
        if (parentBranchId) {
          const parentBranch = useEntityStore.getState().aiBranches[parentBranchId];
          if (parentBranch && !parentBranch.childBranchIds.includes(branchId)) {
            patch("aiBranches", parentBranchId, {
              childBranchIds: [...parentBranch.childBranchIds, branchId],
            } as Partial<AiBranchEntity>);
          }
        }

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
      const conversationId = resolveConversationId(payload, fallbackConversationId);
      const role = payload.role as "USER" | "ASSISTANT" | undefined;

      if (turnId && branchId && role) {
        const hasCanonicalTurnData =
          typeof payload.content === "string" &&
          ("createdAt" in payload ? typeof payload.createdAt === "string" : true);

        if (hasCanonicalTurnData) {
          upsertAiTurnFromServer({
            turnId,
            branchId,
            conversationId,
            role,
            content: payload.content as string,
            parentTurnId: (payload.parentTurnId as string | null | undefined) ?? null,
            branchCount: payload.branchCount as number | undefined,
            createdAt: (payload.createdAt as string | undefined) ?? timestamp,
            timestamp,
            clientMutationId: payload.clientMutationId as string | undefined,
          });
        } else if (conversationId) {
          patch("aiConversations", conversationId, {
            updatedAt: timestamp,
          } as Partial<AiConversationEntity>);
        }
      }
      break;
    }
  }
}
