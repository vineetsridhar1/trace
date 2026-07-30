import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { isLocalMode } from "../../lib/runtime-mode";
import { Button } from "../ui/button";
import { GitHubDeviceLoginPanel } from "./GitHubDeviceLoginPanel";
import { LocalReconnectPanel } from "./LocalReconnectPanel";

export function ReturningUserReconnectPage() {
  const returningUser = useAuthStore((state: AuthState) => state.returningUser);
  const forgetReturningUser = useAuthStore((state: AuthState) => state.forgetReturningUser);

  if (!returningUser) return null;

  function handleReconnect() {
    useUIStore.getState().triggerRefresh();
    toast.success("You’re reconnected", { description: "Syncing has resumed." });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 [background:var(--trace-window-bg)] backdrop-blur-2xl">
      <div className="app-region-drag fixed inset-x-0 top-0 h-14" />
      <div className="flex w-full max-w-sm flex-col items-center gap-6 px-4">
        <div className="space-y-3 text-center">
          {returningUser.avatarUrl ? (
            <img
              src={returningUser.avatarUrl}
              alt=""
              className="mx-auto size-16 rounded-full border border-white/10 object-cover shadow-lg"
            />
          ) : (
            <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-white/10 bg-surface-elevated text-xl font-semibold text-foreground shadow-lg">
              {returningUser.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold text-foreground">
              Welcome back, {returningUser.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {returningUser.organizationName
                ? `Reconnect to ${returningUser.organizationName} and continue where you left off.`
                : "Reconnect to Trace and continue where you left off."}
            </p>
          </div>
        </div>

        <div className="app-region-no-drag w-full">
          {isLocalMode ? (
            <LocalReconnectPanel onSuccess={handleReconnect} />
          ) : (
            <GitHubDeviceLoginPanel
              actionLabel="Reconnect with GitHub"
              onSuccess={handleReconnect}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full gap-2 text-muted-foreground"
            onClick={() => void forgetReturningUser()}
          >
            <LogOut size={14} />
            Use another account
          </Button>
        </div>
      </div>
    </div>
  );
}
