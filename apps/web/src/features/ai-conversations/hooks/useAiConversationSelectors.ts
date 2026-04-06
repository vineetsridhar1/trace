import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useEntityStore,
  useEntityField,
  useEntityIds,
  type AiConversationEntity,
  type AiBranchEntity,
  type AiBranchSummaryEntity,
  type AiTurnEntity,
} from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

// ── Conversation selectors ─────────────────────────────────────

/** Returns the full conversation entity */
export function useAiConversation(id: string): AiConversationEntity | undefined {
  return useEntityStore((state) => state.aiConversations[id]);
}

/** Fine-grained field selector for a conversation */
export function useAiConversationField<F extends keyof AiConversationEntity>(
  id: string,
  field: F,
): AiConversationEntity[F] | undefined {
  return useEntityField("aiConversations", id, field);
}

/** Returns sorted list of conversation IDs for the sidebar */
export function useAiConversations(): string[] {
  return useEntityIds("aiConversations", undefined, (a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Returns whether the current user is the conversation creator */
/** Returns whether the current user is the creator of the conversation */
export function useIsConversationCreator(conversationId: string): boolean {
  const createdById = useEntityField("aiConversations", conversationId, "createdById");
  const userId = useAuthStore((s) => s.user?.id);
  return !!userId && createdById === userId;
}

/** Returns conversation IDs owned by the current user, sorted by updatedAt desc */
export function useMyConversationIds(): string[] {
  const userId = useAuthStore((s) => s.user?.id);
  return useEntityIds(
    "aiConversations",
    (c: AiConversationEntity) => c.createdById === userId,
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Returns ORG-visible conversation IDs created by other users, sorted by updatedAt desc */
export function useSharedConversationIds(): string[] {
  const userId = useAuthStore((s) => s.user?.id);
  return useEntityIds(
    "aiConversations",
    (c: AiConversationEntity) => c.visibility === "ORG" && c.createdById !== userId,
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
/** Returns fork provenance for a conversation (if it was forked) */
export function useConversationForkInfo(conversationId: string): {
  forkedFromConversationId: string | null;
  forkedFromBranchId: string | null;
} {
  const conversation = useEntityStore((s) => s.aiConversations[conversationId]);
  return {
    forkedFromConversationId: conversation?.forkedFromConversationId ?? null,
    forkedFromBranchId: conversation?.forkedFromBranchId ?? null,
  };
}

// ── Branch selectors ───────────────────────────────────────────

/** Returns the full branch entity */
export function useBranch(id: string): AiBranchEntity | undefined {
  return useEntityStore((state) => state.aiBranches[id]);
}

/** Fine-grained field selector for a branch */
export function useBranchField<F extends keyof AiBranchEntity>(
  id: string,
  field: F,
): AiBranchEntity[F] | undefined {
  return useEntityField("aiBranches", id, field);
}

/** Returns ordered turn IDs for a branch */
export function useBranchTurns(branchId: string): string[] {
  return useEntityStore((state) => state.aiBranches[branchId]?.turnIds ?? EMPTY_IDS);
}

const EMPTY_IDS: string[] = [];

/** Timeline entry for rendering a branch view */
export type TimelineEntry =
  | { type: "inherited-turn"; turnId: string }
  | { type: "fork-separator"; forkTurnId: string; parentBranchLabel: string | null }
  | { type: "local-turn"; turnId: string }
  | { type: "summary"; summaryId: string; branchId: string; summarizedTurnCount: number };

/**
 * Returns the derived render timeline for a branch:
 * summary nodes for summarized turns, inherited turns from ancestors,
 * a fork separator, then local turns.
 *
 * Only subscribes to the current branch and its ancestors (not the entire table).
 */
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

  // Get the latest summary for this branch (keyed by branchId)
  const branchSummary = useEntityStore(
    useShallow((state) => {
      const summaries = state.aiBranchSummaries;
      let latest: AiBranchSummaryEntity | undefined;
      for (const id of Object.keys(summaries)) {
        const s = summaries[id];
        if (s.branchId === branchId) {
          if (!latest || s.createdAt > latest.createdAt) {
            latest = s;
          }
        }
      }
      return latest;
    }),
  );

  // Also get the turns table to check summarized status
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

    // Collect inherited turns from ancestor branches
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

    // Local turns — insert summary node before unsummarized turns if summary exists
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
      // No summary — show all turns including summarized ones
      for (const turnId of summarizedTurnIds) {
        entries.push({ type: "local-turn", turnId });
      }
    }

    for (const turnId of unsummarizedTurnIds) {
      entries.push({ type: "local-turn", turnId });
    }

    return entries;
  }, [branch, ancestorBranches, branchSummary, turnsSummarizedMap]);
}

/**
 * Recursively collect inherited turn IDs from ancestor branches,
 * up to and including the fork turn.
 */
function collectInheritedTurns(
  ancestors: Record<string, AiBranchEntity>,
  parentBranchId: string,
  forkTurnId: string,
): string[] {
  const parentBranch = ancestors[parentBranchId];
  if (!parentBranch) return [];

  const result: string[] = [];

  // First collect from grandparent if this branch itself is a fork
  if (parentBranch.parentBranchId && parentBranch.forkTurnId) {
    result.push(
      ...collectInheritedTurns(ancestors, parentBranch.parentBranchId, parentBranch.forkTurnId),
    );
  }

  // Then include parent branch turns up to and including the fork turn
  for (const turnId of parentBranch.turnIds) {
    result.push(turnId);
    if (turnId === forkTurnId) break;
  }

  return result;
}

/** Returns child branch IDs for a given turn (branches forked from this turn) */
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

// ── Turn selectors ─────────────────────────────────────────────

/** Returns the full turn entity */
export function useTurn(id: string): AiTurnEntity | undefined {
  return useEntityStore((state) => state.aiTurns[id]);
}

/** Fine-grained field selector for a turn */
export function useTurnField<F extends keyof AiTurnEntity>(
  id: string,
  field: F,
): AiTurnEntity[F] | undefined {
  return useEntityField("aiTurns", id, field);
}

// ── Summary selectors ─────────────────────────────────────────

/** Returns the latest branch summary entity for a branch */
export function useBranchSummary(branchId: string): AiBranchSummaryEntity | undefined {
  return useEntityStore(
    useShallow((state) => {
      const summaries = state.aiBranchSummaries;
      let latest: AiBranchSummaryEntity | undefined;
      for (const id of Object.keys(summaries)) {
        const s = summaries[id];
        if (s.branchId === branchId) {
          if (!latest || s.createdAt > latest.createdAt) {
            latest = s;
          }
        }
      }
      return latest;
    }),
  );
}

// ── UI state selectors ─────────────────────────────────────────

/** Returns the active branch ID for a conversation */
export function useActiveBranchId(conversationId: string): string | undefined {
  return useAiConversationUIStore((state) => state.activeBranchByConversation[conversationId]);
}

/** Returns the pending scroll target turn ID */
export function useScrollTargetTurnId(): string | null {
  return useAiConversationUIStore((state) => state.scrollTargetTurnId);
}

/** Returns the turn ID currently highlighted after a scroll-to-fork navigation */
export function useHighlightTurnId(): string | null {
  return useAiConversationUIStore((state) => state.highlightTurnId);
}

/** Returns the branch switcher open state */
export function useBranchSwitcherOpen(): boolean {
  return useAiConversationUIStore((state) => state.branchSwitcherOpen);
}

/** Returns the branch tree panel open state */
export function useBranchTreePanelOpen(): boolean {
  return useAiConversationUIStore((state) => state.branchTreePanelOpen);
}

/** Returns whether a tree node is collapsed */
export function useTreeNodeCollapsed(branchId: string): boolean {
  return useAiConversationUIStore((state) => !!state.collapsedTreeNodes[branchId]);
}
