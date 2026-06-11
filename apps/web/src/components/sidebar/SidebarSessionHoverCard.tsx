import { useMemo, type ReactElement } from "react";
import { AppWindow, Calendar, GitBranch, Laptop } from "lucide-react";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";
import { useAttachedCheckoutsForGroup, useDesktopBridgeInfo } from "../../stores/bridges";
import { cn } from "../../lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";

type SidebarUserRef = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
} | null;

type SidebarRepoRef = {
  id?: string | null;
  name?: string | null;
} | null;

type SidebarSessionGroupInfo = {
  name?: string | null;
  repo?: SidebarRepoRef;
  branch?: string | null;
} | null;

type SpotlightDetail = {
  bridgeLabel: string;
  repoName: string | null;
  branch: string | null;
  currentCommitSha: string | null;
  isCurrentBridge: boolean;
  isOtherBridge: boolean;
};

type ApplicationDetail = {
  id: string;
  label: string;
  status: string;
  runtimeInstanceId: string | null;
  startedAt: string | null;
  endpoints: Array<{
    id: string;
    label: string;
    targetPort: number;
    status: string;
    url: string | null;
  }>;
};

export function SidebarSessionHoverCard({
  sessionGroupId,
  sessionId,
  trigger,
}: {
  sessionGroupId: string;
  sessionId: string | null;
  trigger: ReactElement;
}) {
  const resolvedSessionId = sessionId ?? "";
  const lastMessageAt = useEntityField("sessions", resolvedSessionId, "lastMessageAt");
  const branch = useEntityField("sessions", resolvedSessionId, "branch");
  const createdBy = useEntityField("sessions", resolvedSessionId, "createdBy") as
    | SidebarUserRef
    | undefined;
  const sessionGroup = useEntityField("sessions", resolvedSessionId, "sessionGroup") as
    | SidebarSessionGroupInfo
    | undefined;
  const groupBranch = useEntityField("sessionGroups", sessionGroupId, "branch") as
    | string
    | null
    | undefined;
  const groupUpdatedAt = useEntityField("sessionGroups", sessionGroupId, "updatedAt");
  const sessionGroupName = useEntityField("sessionGroups", sessionGroupId, "name") as
    | string
    | null
    | undefined;
  const processTable = useEntityStore((state) => state.sessionApplicationProcesses);
  const endpointTable = useEntityStore((state) => state.sessionEndpoints);
  const attachedCheckouts = useAttachedCheckoutsForGroup(sessionGroupId);
  const desktopBridgeInfo = useDesktopBridgeInfo();
  const spotlightDetails = attachedCheckouts.map((attached): SpotlightDetail => ({
    bridgeLabel: attached.bridgeLabel,
    repoName: attached.checkout.repo?.name ?? null,
    branch: attached.checkout.branch ?? null,
    currentCommitSha: attached.checkout.currentCommitSha ?? null,
    isCurrentBridge: desktopBridgeInfo?.instanceId === attached.bridgeInstanceId,
    isOtherBridge: !!desktopBridgeInfo && desktopBridgeInfo.instanceId !== attached.bridgeInstanceId,
  }));
  const applicationDetails = useMemo(
    () => buildApplicationDetails(sessionGroupId, processTable, endpointTable),
    [endpointTable, processTable, sessionGroupId],
  );

  return (
    <HoverCard>
      <HoverCardTrigger render={trigger} delay={180} closeDelay={120} />
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        alignOffset={-6}
        className="pointer-events-none w-80 rounded-xl border border-white/10 !bg-zinc-900/55 p-3.5 text-foreground shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-2xl"
      >
        <SidebarSessionHoverContent
          branch={branch ?? groupBranch ?? sessionGroup?.branch ?? null}
          createdBy={createdBy}
          lastMessageAt={lastMessageAt ?? groupUpdatedAt}
          sessionGroupName={sessionGroupName ?? sessionGroup?.name ?? null}
          spotlightDetails={spotlightDetails}
          applicationDetails={applicationDetails}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function SidebarSessionHoverContent({
  branch,
  createdBy,
  lastMessageAt,
  sessionGroupName,
  spotlightDetails,
  applicationDetails,
}: {
  branch: string | null;
  createdBy: SidebarUserRef | undefined;
  lastMessageAt: string | null | undefined;
  sessionGroupName: string | null;
  spotlightDetails: SpotlightDetail[];
  applicationDetails: ApplicationDetail[];
}) {
  const ownerName = formatOwnerName(createdBy);
  const ownerEmail = createdBy?.email && createdBy.email !== ownerName ? createdBy.email : null;

  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold leading-snug text-foreground">
        {sessionGroupName ?? "Untitled group"}
      </h3>

      <div className="mt-1.5 flex min-w-0 flex-col gap-1.5 text-xs text-foreground/65">
        <p className="flex min-w-0 items-center gap-1.5">
          <Calendar size={11} className="shrink-0" />
          <span>{formatLastMessage(lastMessageAt)}</span>
        </p>
        {branch && (
          <p className="flex min-w-0 items-start gap-1.5">
            <GitBranch size={11} className="shrink-0" />
            <span className="min-w-0 break-words">{branch}</span>
          </p>
        )}
      </div>

      {spotlightDetails.length > 0 && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
            <Laptop size={12} className="shrink-0" />
            <span>Spotlighted checkout</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {spotlightDetails.map((detail) => (
              <div
                key={`${detail.bridgeLabel}:${detail.repoName ?? ""}:${detail.branch ?? ""}`}
                className="min-w-0 text-xs text-foreground/65"
              >
                <p
                  className={cn(
                    "truncate font-medium",
                    detail.isCurrentBridge
                      ? "text-emerald-400"
                      : detail.isOtherBridge
                        ? "text-amber-400"
                        : "text-foreground/80",
                  )}
                >
                  {detail.isCurrentBridge
                    ? "This bridge"
                    : detail.isOtherBridge
                      ? "Another bridge"
                      : "Bridge"}
                  {`: ${detail.bridgeLabel}`}
                </p>
                {(detail.repoName || detail.branch || detail.currentCommitSha) && (
                  <p className="truncate">
                    {[detail.repoName, detail.branch, shortSha(detail.currentCommitSha)]
                      .filter((part): part is string => !!part)
                      .join(" / ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {applicationDetails.length > 0 && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
            <AppWindow size={12} className="shrink-0 text-sky-400" />
            <span>Applications</span>
          </div>
          <div className="mt-1.5 space-y-2">
            {applicationDetails.map((application) => (
              <div key={application.id} className="min-w-0 text-xs text-foreground/65">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      application.status === "running"
                        ? "bg-emerald-500"
                        : application.status === "starting" || application.status === "stopping"
                          ? "bg-amber-500"
                          : "bg-muted-foreground/50",
                    )}
                  />
                  <p className="min-w-0 flex-1 truncate font-medium text-foreground/80">
                    {application.label}
                  </p>
                  <span className="shrink-0 text-[11px] text-foreground/50">
                    {displayStatus(application.status)}
                  </span>
                </div>
                {application.startedAt && (
                  <p className="mt-0.5 truncate pl-3 text-[11px]">
                    Started {formatLastMessage(application.startedAt)}
                  </p>
                )}
                {application.endpoints.length > 0 && (
                  <div className="mt-1 space-y-0.5 pl-3">
                    {application.endpoints.map((endpoint) => (
                      <p key={endpoint.id} className="truncate text-[11px]">
                        {endpoint.label}:{endpoint.targetPort} · {displayStatus(endpoint.status)}
                        {endpoint.url ? ` · ${endpoint.url}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
        <UserAvatar user={createdBy} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{ownerName}</p>
          {ownerEmail && <p className="truncate text-xs text-foreground/70">{ownerEmail}</p>}
        </div>
      </div>
    </div>
  );
}

function UserAvatar({ user }: { user: SidebarUserRef | undefined }) {
  const ownerName = formatOwnerName(user);
  const initial = ownerName.charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={ownerName}
        className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-foreground ring-1 ring-white/15">
      {initial}
    </span>
  );
}

function formatOwnerName(user: SidebarUserRef | undefined): string {
  return user?.name ?? user?.email ?? "Unknown";
}

function formatLastMessage(timestamp: string | null | undefined): string {
  if (!timestamp) return "No messages yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Last activity unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

function buildApplicationDetails(
  sessionGroupId: string,
  processTable: Record<string, SessionApplicationProcess>,
  endpointTable: Record<string, SessionEndpoint>,
): ApplicationDetail[] {
  const endpointsByProcessKey = new Map<string, SessionEndpoint[]>();
  for (const endpoint of Object.values(endpointTable)) {
    if (endpoint.sessionGroupId !== sessionGroupId) continue;
    const key = `${endpoint.appConfigId}:${endpoint.processConfigId}`;
    endpointsByProcessKey.set(key, [...(endpointsByProcessKey.get(key) ?? []), endpoint]);
  }

  return Object.values(processTable)
    .filter(
      (process) =>
        process.sessionGroupId === sessionGroupId &&
        (process.status === "starting" ||
          process.status === "running" ||
          process.status === "stopping"),
    )
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((process) => {
      const endpoints = endpointsByProcessKey.get(`${process.appConfigId}:${process.processConfigId}`) ?? [];
      return {
        id: process.id,
        label: process.label,
        status: process.status,
        runtimeInstanceId: process.runtimeInstanceId ?? null,
        startedAt: process.startedAt ?? null,
        endpoints: endpoints
          .sort((a, b) => a.targetPort - b.targetPort)
          .map((endpoint) => ({
            id: endpoint.id,
            label: endpoint.label,
            targetPort: endpoint.targetPort,
            status: endpoint.status,
            url: typeof endpoint.url === "string" ? endpoint.url : null,
          })),
      };
    });
}

function displayStatus(status: string): string {
  return status.length > 0 ? `${status[0]?.toUpperCase()}${status.slice(1)}` : status;
}
