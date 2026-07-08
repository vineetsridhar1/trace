import type { CombinedError } from "@urql/core";
import { StoreBatchWriter } from "../stores/entity.js";

/**
 * A queued message can be drained (auto-sent) the moment a run ends, deleting
 * the record server-side before a stale client learns about it. When that
 * happens, steer/remove/update come back with a `NOT_FOUND` GraphQL error.
 * Treat it as already-handled: drop the stale chip locally instead of
 * surfacing a scary error.
 */
export function isMissingQueuedMessageError(error: CombinedError | undefined): boolean {
  return error?.graphQLErrors.some((gqlError) => gqlError.extensions?.code === "NOT_FOUND") ?? false;
}

/**
 * Remove a queued message that no longer exists server-side from the local
 * store, reconciling a stale view that missed the removal event.
 */
export function dropStaleQueuedMessage(sessionId: string, id: string): void {
  const batch = new StoreBatchWriter();
  batch.removeQueuedMessage(sessionId, id);
  batch.flush();
}
