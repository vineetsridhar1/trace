import type { ReactElement } from "react";
import { Circle } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn, timeAgo } from "../../lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";

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

export function SidebarSessionHoverCard({
  agentStatus,
  sessionGroupId,
  sessionId,
  sessionStatus,
  trigger,
}: {
  agentStatus: string;
  sessionGroupId: string;
  sessionId: string;
  sessionStatus: string;
  trigger: ReactElement;
}) {
  const sessionName = useEntityField("sessions", sessionId, "name");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");
  const createdAt = useEntityField("sessions", sessionId, "createdAt");
  const createdBy = useEntityField("sessions", sessionId, "createdBy") as
    | SidebarUserRef
    | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as SidebarRepoRef | undefined;
  const branch = useEntityField("sessions", sessionId, "branch");
  const tool = useEntityField("sessions", sessionId, "tool");
  const model = useEntityField("sessions", sessionId, "model");
  const sessionGroup = useEntityField("sessions", sessionId, "sessionGroup") as
    | SidebarSessionGroupInfo
    | undefined;
  const sessionGroupName = useEntityField(
    "sessionGroups",
    sessionGroupId,
    "name",
  ) as string | null | undefined;

  return (
    <HoverCard>
      <HoverCardTrigger render={trigger} delay={180} closeDelay={120} />
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        alignOffset={-6}
        className="w-80 rounded-xl border border-white/10 !bg-[var(--trace-window-bg)] p-3 text-foreground shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl"
      >
        <SidebarSessionHoverContent
          agentStatus={agentStatus}
          branch={branch ?? sessionGroup?.branch ?? null}
          createdAt={createdAt}
          createdBy={createdBy}
          lastMessageAt={lastMessageAt}
          model={model ?? null}
          repo={repo ?? sessionGroup?.repo ?? null}
          sessionGroupName={sessionGroupName ?? sessionGroup?.name ?? null}
          sessionName={sessionName ?? null}
          sessionStatus={sessionStatus}
          tool={tool ?? null}
          updatedAt={updatedAt}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function SidebarSessionHoverContent({
  agentStatus,
  branch,
  createdAt,
  createdBy,
  lastMessageAt,
  model,
  repo,
  sessionGroupName,
  sessionName,
  sessionStatus,
  tool,
  updatedAt,
}: {
  agentStatus: string;
  branch: string | null;
  createdAt: string | null | undefined;
  createdBy: SidebarUserRef | undefined;
  lastMessageAt: string | null | undefined;
  model: string | null;
  repo: SidebarRepoRef | undefined;
  sessionGroupName: string | null;
  sessionName: string | null;
  sessionStatus: string;
  tool: string | null;
  updatedAt: string | null | undefined;
}) {
  const statusColor = sessionStatusColor[sessionStatus] ?? "text-foreground";
  const statusText = sessionStatusLabel[sessionStatus] ?? formatStatusLabel(sessionStatus);

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
            Session group
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {sessionGroupName ?? "Untitled group"}
          </p>
          <p className="mt-0.5 truncate text-xs text-foreground/70">
            {sessionName ?? "Untitled session"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-medium",
            statusColor,
          )}
        >
          <Circle size={6} className="fill-current" />
          {statusText}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-xs">
        <SidebarSessionHoverField label="Owner" value={formatOwner(createdBy)} />
        <SidebarSessionHoverField label="Last message" value={formatTooltipTime(lastMessageAt)} />
        <SidebarSessionHoverField label="Updated" value={formatTooltipTime(updatedAt)} />
        <SidebarSessionHoverField label="Created" value={formatTooltipTime(createdAt)} />
        {repo?.name && <SidebarSessionHoverField label="Repo" value={repo.name} />}
        {branch && <SidebarSessionHoverField label="Branch" value={branch} />}
        <SidebarSessionHoverField label="Agent" value={formatStatusLabel(agentStatus)} />
        {tool && <SidebarSessionHoverField label="Tool" value={formatStatusLabel(tool)} />}
        {model && <SidebarSessionHoverField label="Model" value={model} />}
      </dl>
    </div>
  );
}

function SidebarSessionHoverField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

function formatOwner(user: SidebarUserRef | undefined): string {
  return user?.name ?? user?.email ?? "Unknown";
}

function formatStatusLabel(value: string): string {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTooltipTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "None";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const exact = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${exact} (${timeAgo(timestamp)})`;
}
