import { useMemo, useState } from "react";
import { Lock, Shield, Clock3, Zap } from "lucide-react";
import { toast } from "sonner";
import type { BridgeAccessCapability } from "@trace/gql";
import { client } from "../../lib/urql";
import { REQUEST_BRIDGE_ACCESS_MUTATION } from "../../lib/mutations";
import { formatCapabilities } from "../../lib/bridge-access";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

type DurationPreset = "1h" | "1d" | "7d" | "never";
type ScopePreset = "all_sessions" | "session_group";

function getRequestedExpiresAt(duration: DurationPreset): string | undefined {
  if (duration === "never") return undefined;

  const now = Date.now();
  const ms =
    duration === "1h"
      ? 60 * 60 * 1000
      : duration === "1d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}

function describeScope(scopeType: ScopePreset, sessionGroupName?: string | null): string {
  if (scopeType === "session_group") {
    return sessionGroupName ? `This workspace only (${sessionGroupName})` : "This workspace only";
  }
  return "All sessions on this bridge";
}

interface BridgeAccessNoticeProps {
  access: BridgeRuntimeAccessInfo | null;
  sessionGroupId?: string | null;
  className?: string;
  onRequested?: () => void | Promise<void>;
}

export function BridgeAccessNotice({
  access,
  sessionGroupId,
  className,
  onRequested,
}: BridgeAccessNoticeProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scopeType, setScopeType] = useState<ScopePreset>(
    sessionGroupId ? "session_group" : "all_sessions",
  );
  const [duration, setDuration] = useState<DurationPreset>("1d");
  const [wantsTerminal, setWantsTerminal] = useState(false);

  const pendingRequest = access?.pendingRequest ?? null;
  const ownerName = access?.ownerUser?.name?.trim() || "the bridge owner";
  const runtimeLabel = access?.label?.trim() || "this bridge";
  const scopeOptions = useMemo(
    () =>
      sessionGroupId
        ? ([
            {
              id: "session_group" as const,
              label: describeScope("session_group", pendingRequest?.sessionGroup?.name),
            },
            { id: "all_sessions" as const, label: describeScope("all_sessions") },
          ] satisfies Array<{ id: ScopePreset; label: string }>)
        : ([{ id: "all_sessions" as const, label: describeScope("all_sessions") }] satisfies Array<{
            id: ScopePreset;
            label: string;
          }>),
    [pendingRequest?.sessionGroup?.name, sessionGroupId],
  );

  if (!access || access.hostingMode !== "local" || access.allowed) {
    return null;
  }

  const handleSubmit = async () => {
    if (!access.runtimeInstanceId || submitting) return;
    setSubmitting(true);
    try {
      const requestedCapabilities: BridgeAccessCapability[] = wantsTerminal
        ? ["session", "terminal"]
        : ["session"];
      const result = await client
        .mutation(REQUEST_BRIDGE_ACCESS_MUTATION, {
          runtimeInstanceId: access.runtimeInstanceId,
          scopeType,
          sessionGroupId: scopeType === "session_group" ? (sessionGroupId ?? undefined) : undefined,
          requestedExpiresAt: getRequestedExpiresAt(duration),
          requestedCapabilities,
        })
        .toPromise();

      if (result.error) {
        throw result.error;
      }

      toast.success("Access request sent");
      setOpen(false);
      await onRequested?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request bridge access");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-50",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-amber-500/20 p-1.5 text-amber-200">
            <Lock size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-amber-100">Bridge access required</div>
            <p className="mt-1 text-xs leading-5 text-amber-100/80">
              {ownerName} needs to grant you access before you can interact with {runtimeLabel}.
            </p>
            {pendingRequest ? (
              <p className="mt-2 text-[11px] text-amber-100/70">
                Request pending for{" "}
                {describeScope(
                  pendingRequest.scopeType,
                  pendingRequest.sessionGroup?.name,
                ).toLowerCase()}
                {pendingRequest.requestedCapabilities &&
                pendingRequest.requestedCapabilities.length > 0 ? (
                  <> — {formatCapabilities(pendingRequest.requestedCapabilities)}</>
                ) : null}
                .
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={submitting || !!pendingRequest}
            className="border-amber-300/30 bg-transparent text-amber-100 hover:bg-amber-500/20 hover:text-amber-50 disabled:opacity-60"
          >
            {pendingRequest ? "Request pending" : "Request access"}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request bridge access</DialogTitle>
            <DialogDescription>
              Ask {ownerName} for permission to use {runtimeLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Shield size={12} />
                Scope
              </div>
              <div className="grid gap-2">
                {scopeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setScopeType(option.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      scopeType === option.id
                        ? "border-foreground bg-surface-elevated text-foreground"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Zap size={12} />
                Capabilities
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-foreground bg-surface-elevated px-3 py-2 text-left text-sm text-foreground opacity-90">
                  <div className="font-medium">Sessions</div>
                  <div className="text-xs text-muted-foreground">Always included</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWantsTerminal((prev) => !prev)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    wantsTerminal
                      ? "border-foreground bg-surface-elevated text-foreground"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="font-medium">Terminal</div>
                  <div className="text-xs text-muted-foreground">
                    {wantsTerminal ? "Included" : "Optional — owner may deny"}
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock3 size={12} />
                Duration
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { id: "1h" as const, label: "1 hour" },
                  { id: "1d" as const, label: "1 day" },
                  { id: "7d" as const, label: "7 days" },
                  { id: "never" as const, label: "No expiration" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDuration(option.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      duration === option.id
                        ? "border-foreground bg-surface-elevated text-foreground"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
