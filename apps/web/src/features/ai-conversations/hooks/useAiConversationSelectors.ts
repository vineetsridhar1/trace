import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useEntityField,
  useEntityIds,
  useEntityStore,
  type AiBranchEntity,
  type AiBranchSummaryEntity,
  type AiConversationEntity,
  type AiTurnEntity,
} from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

export function useAiConversation(id: string): AiConversationEntity | undefined {
  return useEntityStore((state) => state.aiConversations[id]);
}

export function useAiConversationField<F extends keyof AiConversationEntity>(
  id: string,
  field: F,
): AiConversationEntity[F] | undefined {
  return useEntityField("aiConversations", id, field);
}

export function useAiConversations(): string[] {
  return useEntityIds("aiConversations", undefined, (a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function useIsConversationCreator(conversationId: string): boolean {
  const createdById = useEntityField("aiConversations", conversationId, "createdById");
  const userId = useAuthStore((state) => state.user?.id);
  return !!userId && createdById === userId;
}

export function useMyConversationIds(): string[] {
  const userId = useAuthStore((state) => state.user?.id);
  return useEntityIds(
    "aiConversations",
    (conversation: AiConversationEntity) => conversation.createdById === userId,
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function useSharedConversationIds(): string[] {
  const userId = useAuthStore((state) => state.user?.id);
  return useEntityIds(
    "aiConversations",
    (conversation: AiConversationEntity) =>
      conversation.visibility === "ORG" && conversation.createdById !== userId,
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function useConversationForkInfo(conversationId: string): {
  forkedFromConversationId: string | null;
  forkedFromBranchId: string | null;
} {
  const conversation = useEntityStore((state) => state.aiConversations[conversationId]);
  return {
    forkedFromConversationId: conversation?.forkedFromConversationId ?? null,
    forkedFromBranchId: conversation?.forkedFromBranchId ?? null,
  };
}

export function useBranch(id: string): AiBranchEntity | undefined {
  return useEntityStore((state) => state.aiBranches[id]);
}

export function useBranchField<F extends keyof AiBranchEntity>(
  id: string,
  field: F,
): AiBranchEntity[F] | undefined {
  return useEntityField("aiBranches", id, field);
}

export function useBranchTurns(branchId: string): string[] {
  return useEntityStore((state) => state.aiBranches[branchId]?.turnIds ?? EMPTY_IDS);
}

const EMPTY_IDS: string[] = [];

export type TimelineEntry =
  | { type: "inherited-turn"; turnId: string }
  | { type: "fork-separator"; forkTurnId: string; parentBranchLabel: string | null }
  | { type: "local-turn"; turnId: string }
  | { type: "summary"; summaryId: string; branchId: string; summarizedTurnCount: number };

export function useBranchTimeline(branchId: string): TimelineEntry[] {
  const branch = useEntityStore((state) => state.aiBranches[branchId]);

  const ancestorBranches = useEntityStore(
    useShallow((state) => {
      const result: Record<string, AiBranchEntity> = {};
      let current = state.aiBranches[branchId];

      while (current?.parentBranchId) {
        const parent = state.aiBranches[current.parentBranchId];
        if (!parent) break;
        result[parent.id] = parent;
        current = parent;
      }

      return result;
    }),
  );

  const branchSummary = useEntityStore(
    useShallow((state) => {
      const summaries = state.aiBranchSummaries;
      let latest: AiBranchSummaryEntity | undefined;
      for (const id of Object.keys(summaries)) {
        const summary = summaries[id];
        if (summary.branchId === branchId) {
          if (!latest || summary.createdAt > latest.createdAt) {
            latest = summary;
          }
        }
      }
      return latest;
    }),
  );

  const turnsSummarizedMap = useEntityStore(
    useShallow((state) => {
      if (!branch) return {};
      const map: Record<string, boolean> = {};
      for (const turnId of branch.turnIds) {
        const turn = state.aiTurns[turnId];
        if (turn) {
          map[turnId] = turn.summarized;
        }
      }
      return map;
    }),
  );

  return useMemo(() => {
    if (!branch) return [];

    const entries: TimelineEntry[] = [];

    if (branch.parentBranchId && branch.forkTurnId) {
      const inheritedTurns = collectInheritedTurns(
        ancestorBranches,
        branch.parentBranchId,
        branch.forkTurnId,
      );
      for (const turnId of inheritedTurns) {
        entries.push({ type: "inherited-turn", turnId });
      }

      const parentBranch = ancestorBranches[branch.parentBranchId];
      entries.push({
        type: "fork-separator",
        forkTurnId: branch.forkTurnId,
        parentBranchLabel: parentBranch?.label ?? null,
      });
    }

    const summarizedTurnIds = branch.turnIds.filter((id) => turnsSummarizedMap[id]);
    const unsummarizedTurnIds = branch.turnIds.filter((id) => !turnsSummarizedMap[id]);

    if (branchSummary && summarizedTurnIds.length > 0) {
      entries.push({
        type: "summary",
        summaryId: branchSummary.id,
        branchId: branch.id,
        summarizedTurnCount: branchSummary.summarizedTurnCount,
      });
    } else {
      for (const turnId of summarizedTurnIds) {
        entries.push({ type: "local-turn", turnId });
      }
    }

    for (const turnId of unsummarizedTurnIds) {
      entries.push({ type: "local-turn", turnId });
    }

    return entries;
  }, [ancestorBranches, branch, branchSummary, turnsSummarizedMap]);
}

function collectInheritedTurns(
  ancestors: Record<string, AiBranchEntity>,
  parentBranchId: string,
  forkTurnId: string,
): string[] {
  const parentBranch = ancestors[parentBranchId];
  if (!parentBranch) return [];

  const result: string[] = [];

  if (parentBranch.parentBranchId && parentBranch.forkTurnId) {
    result.push(
      ...collectInheritedTurns(ancestors, parentBranch.parentBranchId, parentBranch.forkTurnId),
    );
  }

  for (const turnId of parentBranch.turnIds) {
    result.push(turnId);
    if (turnId === forkTurnId) break;
  }

  return result;
}

export function useChildBranchIds(turnId: string): string[] {
  return useEntityStore(
    useShallow((state) => {
      const ids: string[] = [];
      for (const branch of Object.values(state.aiBranches)) {
        if (branch.forkTurnId === turnId) {
          ids.push(branch.id);
        }
      }
      return ids;
    }),
  );
}

export function useTurn(id: string): AiTurnEntity | undefined {
  return useEntityStore((state) => state.aiTurns[id]);
}

export function useTurnField<F extends keyof AiTurnEntity>(
  id: string,
  field: F,
): AiTurnEntity[F] | undefined {
  return useEntityField("aiTurns", id, field);
}

export function useBranchSummary(branchId: string): AiBranchSummaryEntity | undefined {
  return useEntityStore(
    useShallow((state) => {
      const summaries = state.aiBranchSummaries;
      let latest: AiBranchSummaryEntity | undefined;
      for (const id of Object.keys(summaries)) {
        const summary = summaries[id];
        if (summary.branchId === branchId) {
          if (!latest || summary.createdAt > latest.createdAt) {
            latest = summary;
          }
        }
      }
      return latest;
    }),
  );
}

export function useActiveBranchId(conversationId: string): string | undefined {
  return useAiConversationUIStore((state) => state.activeBranchByConversation[conversationId]);
}

export function useScrollTargetTurnId(): string | null {
  return useAiConversationUIStore((state) => state.scrollTargetTurnId);
}

export function useHighlightTurnId(): string | null {
  return useAiConversationUIStore((state) => state.highlightTurnId);
}

export function useBranchSwitcherOpen(): boolean {
  return useAiConversationUIStore((state) => state.branchSwitcherOpen);
}

export function useBranchTreePanelOpen(): boolean {
  return useAiConversationUIStore((state) => state.branchTreePanelOpen);
}

export function useTreeNodeCollapsed(branchId: string): boolean {
  return useAiConversationUIStore((state) => !!state.collapsedTreeNodes[branchId]);
}
