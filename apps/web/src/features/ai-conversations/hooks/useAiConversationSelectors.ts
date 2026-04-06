import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useEntityStore,
  useEntityField,
  useEntityIds,
  type AiConversationEntity,
  type AiBranchEntity,
  type AiTurnEntity,
} from "../../../stores/entity";
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
  | { type: "local-turn"; turnId: string };

/**
 * Returns the derived render timeline for a branch:
 * inherited turns from ancestors, a fork separator, then local turns.
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

    // Local turns
    for (const turnId of branch.turnIds) {
      entries.push({ type: "local-turn", turnId });
    }

    return entries;
  }, [branch, ancestorBranches]);
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

// ── UI state selectors ─────────────────────────────────────────

/** Returns the active branch ID for a conversation */
export function useActiveBranchId(conversationId: string): string | undefined {
  return useAiConversationUIStore((state) => state.activeBranchByConversation[conversationId]);
}

/** Returns the pending scroll target turn ID */
export function useScrollTargetTurnId(): string | null {
  return useAiConversationUIStore((state) => state.scrollTargetTurnId);
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
