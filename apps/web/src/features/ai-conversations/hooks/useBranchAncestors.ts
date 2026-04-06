import { useShallow } from "zustand/react/shallow";
import { useEntityStore, type AiBranchEntity } from "../../../stores/entity";

/** Ancestor info needed for breadcrumb rendering */
export interface BranchAncestorInfo {
  id: string;
  label: string | null | undefined;
  firstTurnId: string | undefined;
}

/**
 * Returns the ancestor chain from root to the given branch (inclusive),
 * computed client-side by walking parentBranchId in the Zustand store.
 */
export function useBranchAncestors(branchId: string): BranchAncestorInfo[] {
  return useEntityStore(
    useShallow((state) => {
      const ancestors: BranchAncestorInfo[] = [];
      let current: AiBranchEntity | undefined = state.aiBranches[branchId];

      // Walk up to root, collecting ancestors
      while (current) {
        ancestors.unshift({
          id: current.id,
          label: current.label,
          firstTurnId: current.turnIds[0],
        });

        if (current.parentBranchId) {
          current = state.aiBranches[current.parentBranchId];
        } else {
          break;
        }
      }

      return ancestors;
    }),
  );
}
