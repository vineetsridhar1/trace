import { useCallback } from "react";
import { gql } from "@urql/core";
import { mutateOptimistically } from "../../lib/optimistic-mutation";
import { useUIStore } from "../../stores/ui";

const HIDE_SESSION_TAB_MUTATION = gql`
  mutation HideSessionTab($sessionId: ID!) {
    hideSessionTab(sessionId: $sessionId) {
      sessionId
      hiddenAt
    }
  }
`;

const RESTORE_SESSION_TAB_MUTATION = gql`
  mutation RestoreSessionTab($sessionId: ID!) {
    restoreSessionTab(sessionId: $sessionId)
  }
`;

/**
 * Closing and reopening a session tab. Both directions apply to the store
 * first and roll back if the server refuses, so the tab strip always reflects
 * the click and never a change that did not happen.
 *
 * `session_tab_hidden` / `session_tab_restored` still arrive through the org
 * event stream and reconcile the same state; both store updates are idempotent
 * with those events.
 */
export function useSessionTabClose(sessionGroupId: string) {
  const hideSessionTab = useUIStore((s) => s.hideSessionTab);
  const restoreSessionTab = useUIStore((s) => s.restoreSessionTab);
  const openSessionTab = useUIStore((s) => s.openSessionTab);

  const closeSession = useCallback(
    (sessionId: string) =>
      mutateOptimistically({
        apply: () => {
          hideSessionTab(sessionGroupId, sessionId, new Date().toISOString());
          return () => restoreSessionTab(sessionGroupId, sessionId);
        },
        document: HIDE_SESSION_TAB_MUTATION,
        variables: { sessionId },
        failureMessage: "Could not close that tab",
      }),
    [hideSessionTab, restoreSessionTab, sessionGroupId],
  );

  const restoreSession = useCallback(
    (sessionId: string) => {
      // Without the mutation the tab reappears locally and is hidden again on
      // the next load, so the restore has to reach the server too.
      const hiddenAt = new Date().toISOString();
      return mutateOptimistically({
        apply: () => {
          restoreSessionTab(sessionGroupId, sessionId);
          openSessionTab(sessionGroupId, sessionId);
          return () => hideSessionTab(sessionGroupId, sessionId, hiddenAt);
        },
        document: RESTORE_SESSION_TAB_MUTATION,
        variables: { sessionId },
        failureMessage: "Could not reopen that tab",
      });
    },
    [hideSessionTab, openSessionTab, restoreSessionTab, sessionGroupId],
  );

  return { closeSession, restoreSession };
}
