import { useBridgeAuthStore } from "../stores/bridge-auth";
import type { CombinedError } from "@urql/core";

export type BridgeAccessAction =
  | "start_session"
  | "send_message"
  | "switch_runtime";

type BridgeAccessRetryOptions = {
  action: BridgeAccessAction;
  retryAction: () => Promise<void>;
  sessionId?: string | null;
  promptPreview?: string | null;
};

/**
 * Check if a GraphQL error is a BRIDGE_ACCESS_REQUIRED error.
 * If so, open the bridge access verification dialog and return true.
 * Otherwise return false so the caller can handle the error normally.
 */
export function handleBridgeAccessError(
  error: unknown,
  options: BridgeAccessRetryOptions,
): boolean {
  const extensions = extractBridgeAccessExtensions(error);
  if (!extensions) return false;

  useBridgeAuthStore.getState().openChallenge(
    {
      runtimeId: extensions.runtimeId,
      runtimeLabel: extensions.runtimeLabel,
      action: options.action,
      sessionId: options.sessionId ?? null,
      promptPreview: options.promptPreview ?? null,
    },
    options.retryAction,
  );

  return true;
}

function extractBridgeAccessExtensions(
  error: unknown,
): { runtimeId: string; runtimeLabel: string; ownerUserId: string } | null {
  if (!error) return null;

  // urql CombinedError wraps GraphQL errors
  const combinedError = error as CombinedError;
  if (combinedError.graphQLErrors) {
    for (const gqlError of combinedError.graphQLErrors) {
      if (gqlError.extensions?.code === "BRIDGE_ACCESS_REQUIRED") {
        return {
          runtimeId: gqlError.extensions.runtimeId as string,
          runtimeLabel: gqlError.extensions.runtimeLabel as string,
          ownerUserId: gqlError.extensions.ownerUserId as string,
        };
      }
    }
  }

  return null;
}
