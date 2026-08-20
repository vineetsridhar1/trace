import type { DocumentNode } from "graphql";
import { toast } from "sonner";
import { client } from "./urql";

export interface OptimisticMutation {
  /**
   * Applies the change to the store and returns how to undo it, so the UI
   * responds to the click rather than to the round trip. Return null when
   * there was nothing to apply — the request is then skipped.
   */
  apply: () => (() => void) | null;
  document: DocumentNode;
  variables: Record<string, unknown>;
  /** Shown to the user when the change is rolled back. */
  failureMessage: string;
}

/**
 * Apply a change locally, confirm it with the server, and undo it if the server
 * refuses.
 *
 * Waiting for the event stream to confirm a removal makes a click look like it
 * did nothing; applying it with no rollback makes a failure look like it
 * worked. Both read to the user as "the thing I closed came back" or "the thing
 * I closed is still running". Every optimistic mutation should go through here
 * so neither is possible.
 *
 * Resolves true when the server accepted the change. The matching event still
 * arrives through the org event stream and reconciles the store as usual, so
 * the updates `apply` makes have to be idempotent with it.
 */
export async function mutateOptimistically(input: OptimisticMutation): Promise<boolean> {
  const revert = input.apply();
  if (!revert) return false;
  try {
    const result = await client.mutation(input.document, input.variables).toPromise();
    if (!result.error) return true;
    console.error(`[optimistic] ${input.failureMessage}:`, result.error.message);
  } catch (error: unknown) {
    console.error(
      `[optimistic] ${input.failureMessage}:`,
      error instanceof Error ? error.message : error,
    );
  }
  revert();
  toast.error(input.failureMessage);
  return false;
}
