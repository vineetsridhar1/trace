import { useAuthStore } from "@trace/client-core";
import { useAuthReconnectStore } from "../stores/auth-reconnect";

/** Opens reconnect UI and blocks a protected action when the cached session is read-only. */
export function canPerformAuthenticatedAction(): boolean {
  if (!useAuthStore.getState().reauthRequired) return true;
  useAuthReconnectStore.getState().openDialog();
  return false;
}
