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
  sessionGroupId,
  sessionId,
  sessionStatus,
  trigger,
}: {
  sessionGroupId: string;
  sessionId: string;
  sessionStatus: string;
  trigger: ReactElement;
}) {
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const createdBy = useEntityField("sessions", sessionId, "createdBy") as
    | SidebarUserRef
    | undefined;
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
        className="w-96 rounded-xl border border-white/10 !bg-[var(--trace-window-bg)] p-4 text-foreground shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl"
      >
        <SidebarSessionHoverContent
          createdBy={createdBy}
          lastMessageAt={lastMessageAt}
          sessionGroupName={sessionGroupName ?? sessionGroup?.name ?? null}
          sessionStatus={sessionStatus}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function SidebarSessionHoverContent({
  createdBy,
  lastMessageAt,
  sessionGroupName,
  sessionStatus,
}: {
  createdBy: SidebarUserRef | undefined;
  lastMessageAt: string | null | undefined;
  sessionGroupName: string | null;
  sessionStatus: string;
}) {
  const statusColor = sessionStatusColor[sessionStatus] ?? "text-foreground";
  const statusText = sessionStatusLabel[sessionStatus] ?? formatStatusLabel(sessionStatus);
  const ownerName = formatOwnerName(createdBy);
  const ownerEmail = createdBy?.email && createdBy.email !== ownerName ? createdBy.email : null;

  return (
    <div className="min-w-0 space-y-4">
      <h3 className="text-base font-semibold leading-snug text-foreground">
        {sessionGroupName ?? "Untitled group"}
      </h3>

      <div className="flex items-center gap-3">
        <UserAvatar user={createdBy} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{ownerName}</p>
          {ownerEmail && <p className="truncate text-xs text-foreground/70">{ownerEmail}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium",
            statusColor,
          )}
        >
          <Circle size={6} className="shrink-0 fill-current" />
          <span className="truncate">{statusText}</span>
        </span>
        <p className="min-w-0 truncate text-right text-xs text-foreground/75">
          {formatLastMessage(lastMessageAt)}
        </p>
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

function formatStatusLabel(value: string): string {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLastMessage(timestamp: string | null | undefined): string {
  if (!timestamp) return "No messages yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Last activity unknown";
  const exact = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${timeAgo(timestamp)} · ${exact}`;
}
