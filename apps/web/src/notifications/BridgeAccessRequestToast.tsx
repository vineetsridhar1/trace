import { useState } from "react";
import { Clock3, Lock, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import type { BridgeAccessCapability } from "@trace/gql";
import { client } from "../lib/urql";
import { DENY_BRIDGE_ACCESS_REQUEST_MUTATION } from "@trace/client-core";
import { formatCapabilities } from "../lib/bridge-access";
import { useUIStore } from "../stores/ui";
import { Button } from "../components/ui/button";

export type BridgeAccessRequestToastData = {
  ownerUserId: string;
  requestId: string;
  runtimeInstanceId: string;
  runtimeLabel: string;
  scopeType: "all_sessions" | "session_group";
  sessionGroup: { id: string; name?: string | null } | null;
  requestedCapabilities?: BridgeAccessCapability[];
  requestedExpiresAt?: string | null;
  createdAt: string;
  status: "pending" | "approved" | "denied";
  requesterUser: {
    id: string;
    name?: string | null;
    avatarUrl?: string | null;
  };
  grant?: {
    id: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    capabilities?: BridgeAccessCapability[];
    expiresAt?: string | null;
    createdAt: string;
  } | null;
};

function formatRequestedScope(data: BridgeAccessRequestToastData): string {
  if (data.scopeType === "session_group") {
    return data.sessionGroup?.name
      ? `This workspace (${data.sessionGroup.name})`
      : "This workspace";
  }
  return "All sessions on this bridge";
}

function formatRequestedDuration(requestedExpiresAt?: string | null): string {
  if (!requestedExpiresAt) return "No expiration";

  const date = new Date(requestedExpiresAt);
  if (Number.isNaN(date.getTime())) return "Custom expiration";
  return `Until ${date.toLocaleString()}`;
}

export function BridgeAccessRequestToast({
  toastId,
  request,
}: {
  toastId: string;
  request: BridgeAccessRequestToastData;
}) {
  const [pendingAction, setPendingAction] = useState<"review" | "deny" | null>(null);

  const requesterName = request.requesterUser.name?.trim() || "A teammate";
  const runtimeLabel = request.runtimeLabel.trim() || "your bridge";
  const requestedCaps = request.requestedCapabilities ?? [];

  const runReview = () => {
    setPendingAction("review");
    toast.dismiss(toastId);
    const ui = useUIStore.getState();
    ui.setSettingsInitialTab("bridge-access");
    ui.setActivePage("settings");
  };

  const runDeny = async () => {
    if (pendingAction) return;
    setPendingAction("deny");
    try {
      const result = await client
        .mutation(DENY_BRIDGE_ACCESS_REQUEST_MUTATION, {
          requestId: request.requestId,
        })
        .toPromise();

      if (result.error) {
        throw result.error;
      }

      toast.dismiss(toastId);
      toast.success(`Denied ${requesterName}'s bridge request`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deny bridge access");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-500/15 p-2 text-amber-400">
          <Lock size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {requesterName} requested bridge access
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Allow {requesterName} to interact with {runtimeLabel}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
              <Shield size={11} />
              {formatRequestedScope(request)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
              <Clock3 size={11} />
              {formatRequestedDuration(request.requestedExpiresAt)}
            </span>
            {requestedCaps.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
                <Zap size={11} />
                {formatCapabilities(requestedCaps)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!!pendingAction} onClick={runReview}>
          Review in settings
        </Button>
        <Button variant="ghost" size="sm" disabled={!!pendingAction} onClick={() => void runDeny()}>
          Deny
        </Button>
      </div>
    </div>
  );
}
