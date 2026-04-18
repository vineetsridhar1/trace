import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Laptop, Shield, Clock3, Inbox, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import {
  APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION,
  DENY_BRIDGE_ACCESS_REQUEST_MUTATION,
  MY_BRIDGE_RUNTIMES_QUERY,
  REVOKE_BRIDGE_ACCESS_GRANT_MUTATION,
} from "../../lib/mutations";
import { useUIStore } from "../../stores/ui";
import {
  BRIDGE_ACCESS_APPROVAL_OPTIONS,
  getBridgeAccessApprovalExpiresAt,
} from "../../lib/bridge-access";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type BridgeUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type BridgeAccessRequest = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  requesterUser: BridgeUser;
  sessionGroup?: { id: string; name?: string | null } | null;
};

type BridgeAccessGrant = {
  id: string;
  scopeType: "all_sessions" | "session_group";
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
  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);

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
                      {runtime.accessRequests.map((request) => (
                        <div key={request.id} className="rounded-lg border border-border bg-surface-deep p-3">
                          <div className="text-sm font-medium text-foreground">
                            {request.requesterUser.name || request.requesterUser.email || "Unknown user"}
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
                          <div className="mt-3 flex flex-wrap gap-2">
                            {request.sessionGroup?.id && (
                              <Button
                                size="sm"
                                disabled={pendingActionId === request.id}
                                onClick={() =>
                                  void runAction(
                                    request.id,
                                    async () => {
                                      const result = await client
                                        .mutation(APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION, {
                                          requestId: request.id,
                                          scopeType: "session_group",
                                          sessionGroupId: request.sessionGroup?.id,
                                          expiresAt: null,
                                        })
                                        .toPromise();
                                      if (result.error) throw result.error;
                                    },
                                    "Access granted for this session",
                                  )
                                }
                              >
                                Approve This Session
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={cn(buttonVariants({ size: "sm" }), "gap-1")}
                                disabled={pendingActionId === request.id}
                              >
                                Approve All Sessions
                                <ChevronDown size={14} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-44">
                                {BRIDGE_ACCESS_APPROVAL_OPTIONS.map((option) => (
                                  <DropdownMenuItem
                                    key={option.id}
                                    onClick={() =>
                                      void runAction(
                                        request.id,
                                        async () => {
                                          const result = await client
                                            .mutation(APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION, {
                                              requestId: request.id,
                                              scopeType: "all_sessions",
                                              sessionGroupId: null,
                                              expiresAt: getBridgeAccessApprovalExpiresAt(option.id),
                                            })
                                            .toPromise();
                                          if (result.error) throw result.error;
                                        },
                                        `Access granted for ${option.label}`,
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
                      ))}
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
                      {runtime.accessGrants.map((grant) => (
                        <div key={grant.id} className="rounded-lg border border-border bg-surface-deep p-3">
                          <div className="text-sm font-medium text-foreground">
                            {grant.granteeUser.name || grant.granteeUser.email || "Unknown user"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {describeScope(grant.scopeType, grant.sessionGroup)}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock3 size={11} />
                            Expires {formatDate(grant.expiresAt)}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Shield size={11} />
                            Granted {formatDate(grant.createdAt)}
                          </div>
                          <div className="mt-3">
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
                      ))}
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
