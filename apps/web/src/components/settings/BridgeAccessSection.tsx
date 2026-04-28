import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Laptop, Shield, Clock3, Inbox, UserRoundCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import type { BridgeAccessCapability } from "@trace/gql";
import { client } from "../../lib/urql";
import {
  APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION,
  DENY_BRIDGE_ACCESS_REQUEST_MUTATION,
  MY_BRIDGE_RUNTIMES_QUERY,
  REVOKE_BRIDGE_ACCESS_GRANT_MUTATION,
  UPDATE_BRIDGE_ACCESS_GRANT_MUTATION,
} from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import {
  BRIDGE_ACCESS_APPROVAL_OPTIONS,
  ensureSessionCapability,
  formatCapabilities,
  getBridgeAccessApprovalExpiresAt,
} from "../../lib/bridge-access";
import { cn } from "../../lib/utils";
import { isLocalMode } from "../../lib/runtime-mode";
import { Button, buttonVariants } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { LocalMobilePairingSection } from "./LocalMobilePairingSection";
import { CurrentBridgeSection } from "./CurrentBridgeSection";

type BridgeUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type BridgeAccessRequest = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
  requestedCapabilities?: BridgeAccessCapability[];
  status: "pending" | "approved" | "denied";
  createdAt: string;
  requesterUser: BridgeUser;
  sessionGroup?: { id: string; name?: string | null } | null;
};

type BridgeAccessGrant = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  capabilities?: BridgeAccessCapability[];
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  granteeUser: BridgeUser;
  grantedByUser: BridgeUser;
  sessionGroup?: { id: string; name?: string | null } | null;
};

type BridgeRuntimeItem = {
  id: string;
  instanceId: string;
  label: string;
  hostingMode: "cloud" | "local";
  lastSeenAt: string;
  connectedAt?: string | null;
  disconnectedAt?: string | null;
  connected: boolean;
  ownerUser: BridgeUser;
  accessRequests: BridgeAccessRequest[];
  accessGrants: BridgeAccessGrant[];
};

function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function describeScope(
  scopeType: "all_sessions" | "session_group",
  sessionGroup?: { name?: string | null } | null,
): string {
  if (scopeType === "session_group") {
    return sessionGroup?.name ? `Workspace: ${sessionGroup.name}` : "Single workspace";
  }
  return "All sessions";
}

export function BridgeAccessSection() {
  const [runtimes, setRuntimes] = useState<BridgeRuntimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [grantTerminalByRequestId, setGrantTerminalByRequestId] = useState<Record<string, boolean>>(
    {},
  );
  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);

  const buildCapabilities = useCallback(
    (request: BridgeAccessRequest): BridgeAccessCapability[] => {
      const terminal =
        grantTerminalByRequestId[request.id] ??
        (request.requestedCapabilities?.includes("terminal") ?? false);
      return terminal ? ["session", "terminal"] : ["session"];
    },
    [grantTerminalByRequestId],
  );

  const approveRequest = useCallback(
    async (
      request: BridgeAccessRequest,
      input?: {
        scopeType?: "all_sessions" | "session_group";
        sessionGroupId?: string | null;
        expiresAt?: string | null;
      },
    ) => {
      const result = await client
        .mutation(APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION, {
          requestId: request.id,
          scopeType: input?.scopeType ?? request.scopeType,
          sessionGroupId:
            input?.scopeType === "all_sessions"
              ? null
              : (input?.sessionGroupId ?? request.sessionGroup?.id ?? null),
          expiresAt:
            Object.prototype.hasOwnProperty.call(input ?? {}, "expiresAt")
              ? input?.expiresAt
              : (request.requestedExpiresAt ?? null),
          capabilities: buildCapabilities(request),
        })
        .toPromise();
      if (result.error) throw result.error;
    },
    [buildCapabilities],
  );

  const fetchRuntimes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client
        .query(MY_BRIDGE_RUNTIMES_QUERY, {}, { requestPolicy: "network-only" })
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      setRuntimes((result.data?.myBridgeRuntimes as BridgeRuntimeItem[] | undefined) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load bridge access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRuntimes();
  }, [fetchRuntimes, refreshTick]);

  // Drop stale toggle state for requests that are no longer pending (resolved
  // by approve/deny or superseded). Without this the map would grow for the
  // lifetime of the settings view.
  useEffect(() => {
    const activeIds = new Set(
      runtimes.flatMap((runtime) => runtime.accessRequests.map((r) => r.id)),
    );
    setGrantTerminalByRequestId((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [id, value] of Object.entries(prev)) {
        if (activeIds.has(id)) {
          next[id] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [runtimes]);

  const runAction = useCallback(
    async (id: string, action: () => Promise<void>, successMessage: string) => {
      setPendingActionId(id);
      try {
        await action();
        toast.success(successMessage);
        await fetchRuntimes();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bridge access update failed");
      } finally {
        setPendingActionId(null);
      }
    },
    [fetchRuntimes],
  );

  return (
    <div>
      {isLocalMode ? <LocalMobilePairingSection /> : null}
      <CurrentBridgeSection onRenamed={fetchRuntimes} />
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Bridge Access</h2>
        <p className="text-sm text-muted-foreground">
          Review requests for your local bridges, approve shared access, and revoke grants.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          Loading bridge access...
        </div>
      ) : runtimes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-deep p-6 text-sm text-muted-foreground">
          No local bridges have connected under your account yet.
        </div>
      ) : (
        <div className="space-y-4">
          {runtimes.map((runtime) => (
            <div key={runtime.id} className="rounded-xl border border-border bg-surface-deep p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Laptop size={16} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">{runtime.label}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        runtime.connected
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-border text-muted-foreground"
                      }`}
                    >
                      {runtime.connected ? "Connected" : "Offline"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last seen {formatDate(runtime.lastSeenAt)}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{runtime.accessRequests.length} pending request(s)</div>
                  <div>{runtime.accessGrants.length} active grant(s)</div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-surface p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Inbox size={12} />
                    Pending Requests
                  </div>
                  {runtime.accessRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending requests.</p>
                  ) : (
                    <div className="space-y-3">
                      {runtime.accessRequests.map((request) => {
                        const requestedTerminal =
                          request.requestedCapabilities?.includes("terminal") ?? false;
                        const grantTerminal =
                          grantTerminalByRequestId[request.id] ?? requestedTerminal;
                        const capabilities = buildCapabilities(request);
                        return (
                          <div
                            key={request.id}
                            className="rounded-lg border border-border bg-surface-deep p-3"
                          >
                            <div className="text-sm font-medium text-foreground">
                              {request.requesterUser.name ||
                                request.requesterUser.email ||
                                "Unknown user"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {describeScope(request.scopeType, request.sessionGroup)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Requested {formatDate(request.createdAt)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Expires {formatDate(request.requestedExpiresAt)}
                            </div>
                            {request.requestedCapabilities &&
                            request.requestedCapabilities.length > 0 ? (
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Zap size={11} />
                                Asked for: {formatCapabilities(request.requestedCapabilities)}
                              </div>
                            ) : null}
                            <div className="mt-3 rounded-md border border-border/60 bg-surface p-2">
                              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <Shield size={11} />
                                Grant capabilities
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-xs text-foreground">
                                  <div className="font-medium">Sessions</div>
                                  <div className="text-[11px] text-muted-foreground">Required</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGrantTerminalByRequestId((prev) => ({
                                      ...prev,
                                      [request.id]: !grantTerminal,
                                    }))
                                  }
                                  className={cn(
                                    "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                                    grantTerminal
                                      ? "border-foreground bg-surface-elevated text-foreground"
                                      : "border-border bg-surface-deep text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  <div className="font-medium">Terminal</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {grantTerminal
                                      ? requestedTerminal
                                        ? "Requested by the user"
                                        : "Will grant shell access"
                                      : requestedTerminal
                                        ? "Removed from approval"
                                        : "Off"}
                                  </div>
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={
                                  pendingActionId === request.id ||
                                  (request.scopeType === "session_group" &&
                                    !request.sessionGroup?.id)
                                }
                                onClick={() =>
                                  void runAction(
                                    request.id,
                                    () => approveRequest(request),
                                    `Access granted — ${formatCapabilities(capabilities)}`,
                                  )
                                }
                              >
                                Approve Request
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className={cn(
                                    buttonVariants({ variant: "outline", size: "sm" }),
                                    "gap-1",
                                  )}
                                  disabled={pendingActionId === request.id}
                                >
                                  Approve with changes
                                  <ChevronDown size={14} />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-44">
                                  {request.sessionGroup?.id &&
                                  request.scopeType !== "session_group" ? (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void runAction(
                                          request.id,
                                          () =>
                                            approveRequest(request, {
                                              scopeType: "session_group",
                                              sessionGroupId: request.sessionGroup?.id,
                                              expiresAt: request.requestedExpiresAt ?? null,
                                            }),
                                          `Access granted — ${formatCapabilities(capabilities)}`,
                                        )
                                      }
                                    >
                                      This workspace
                                    </DropdownMenuItem>
                                  ) : null}
                                  {BRIDGE_ACCESS_APPROVAL_OPTIONS.map((option) => (
                                    <DropdownMenuItem
                                      key={option.id}
                                      onClick={() =>
                                        void runAction(
                                          request.id,
                                          () =>
                                            approveRequest(request, {
                                              scopeType: "all_sessions",
                                              sessionGroupId: null,
                                              expiresAt: getBridgeAccessApprovalExpiresAt(
                                                option.id,
                                              ),
                                            }),
                                          `Access granted for ${option.label} — ${formatCapabilities(capabilities)}`,
                                        )
                                      }
                                    >
                                      {option.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pendingActionId === request.id}
                                onClick={() =>
                                  void runAction(
                                    request.id,
                                    async () => {
                                      const result = await client
                                        .mutation(DENY_BRIDGE_ACCESS_REQUEST_MUTATION, {
                                          requestId: request.id,
                                        })
                                        .toPromise();
                                      if (result.error) throw result.error;
                                    },
                                    "Request denied",
                                  )
                                }
                              >
                                Deny
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/70 bg-surface p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <UserRoundCheck size={12} />
                    Active Grants
                  </div>
                  {runtime.accessGrants.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active grants.</p>
                  ) : (
                    <div className="space-y-3">
                      {runtime.accessGrants.map((grant) => {
                        const grantCaps = grant.capabilities ?? [];
                        const hasTerminal = grantCaps.includes("terminal");
                        const toggleTerminal = async () => {
                          const nextCaps: BridgeAccessCapability[] = hasTerminal
                            ? ensureSessionCapability(grantCaps.filter((c) => c !== "terminal"))
                            : ensureSessionCapability([...grantCaps, "terminal"]);
                          await runAction(
                            grant.id,
                            async () => {
                              const result = await client
                                .mutation(UPDATE_BRIDGE_ACCESS_GRANT_MUTATION, {
                                  grantId: grant.id,
                                  capabilities: nextCaps,
                                })
                                .toPromise();
                              if (result.error) throw result.error;
                            },
                            hasTerminal
                              ? "Terminal access revoked — live terminals closed"
                              : "Terminal access granted",
                          );
                        };
                        return (
                          <div
                            key={grant.id}
                            className="rounded-lg border border-border bg-surface-deep p-3"
                          >
                            <div className="text-sm font-medium text-foreground">
                              {grant.granteeUser.name || grant.granteeUser.email || "Unknown user"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {describeScope(grant.scopeType, grant.sessionGroup)}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {grantCaps.length === 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted-foreground">
                                  <Zap size={10} />
                                  No capabilities
                                </span>
                              ) : (
                                grantCaps.map((cap) => (
                                  <span
                                    key={cap}
                                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
                                  >
                                    <Zap size={10} />
                                    {cap === "session" ? "Sessions" : "Terminal"}
                                  </span>
                                ))
                              )}
                            </div>
                            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock3 size={11} />
                              Expires {formatDate(grant.expiresAt)}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Shield size={11} />
                              Granted {formatDate(grant.createdAt)}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pendingActionId === grant.id}
                                onClick={() => void toggleTerminal()}
                              >
                                {hasTerminal ? "Disable terminal" : "Enable terminal"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pendingActionId === grant.id}
                                onClick={() =>
                                  void runAction(
                                    grant.id,
                                    async () => {
                                      const result = await client
                                        .mutation(REVOKE_BRIDGE_ACCESS_GRANT_MUTATION, {
                                          grantId: grant.id,
                                        })
                                        .toPromise();
                                      if (result.error) throw result.error;
                                    },
                                    "Grant revoked",
                                  )
                                }
                              >
                                Revoke
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
