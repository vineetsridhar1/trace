import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useAuthReconnectStore } from "../../stores/auth-reconnect";
import { useUIStore } from "../../stores/ui";
import { isLocalMode } from "../../lib/runtime-mode";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { GitHubDeviceLoginPanel } from "./GitHubDeviceLoginPanel";
import { LocalReconnectPanel } from "./LocalReconnectPanel";

export function AuthReconnectDialog() {
  const reauthRequired = useAuthStore((state: AuthState) => state.reauthRequired);
  const logout = useAuthStore((state: AuthState) => state.logout);
  const dialogOpen = useAuthReconnectStore((state) => state.dialogOpen);
  const closeDialog = useAuthReconnectStore((state) => state.closeDialog);
  const reset = useAuthReconnectStore((state) => state.reset);

  const handleReconnect = useCallback(() => {
    reset();
    useUIStore.getState().triggerRefresh();
    toast.success("You’re reconnected", { description: "Syncing has resumed." });
  }, [reset]);

  useEffect(() => {
    if (!reauthRequired) reset();
  }, [reauthRequired, reset]);

  return (
    <Dialog
      open={reauthRequired && dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconnect to Trace</DialogTitle>
          <DialogDescription>
            Your sign-in expired, but your current workspace is still open. Confirm your identity to
            continue where you left off.
          </DialogDescription>
        </DialogHeader>

        {isLocalMode ? (
          <LocalReconnectPanel onSuccess={handleReconnect} />
        ) : (
          <GitHubDeviceLoginPanel actionLabel="Reconnect with GitHub" onSuccess={handleReconnect} />
        )}

        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          Sign out instead
        </Button>
      </DialogContent>
    </Dialog>
  );
}
