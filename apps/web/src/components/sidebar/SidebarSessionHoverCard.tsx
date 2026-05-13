import type { ReactElement } from "react";
import { useEntityField } from "@trace/client-core";
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

export function SidebarSessionHoverCard({
  sessionGroupId,
  sessionId,
  trigger,
}: {
  sessionGroupId: string;
  sessionId: string;
  trigger: ReactElement;
}) {
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const branch = useEntityField("sessions", sessionId, "branch");
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
        className="w-80 rounded-xl border border-white/10 !bg-zinc-900/72 p-3.5 text-foreground shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-2xl"
      >
        <SidebarSessionHoverContent
          branch={branch ?? sessionGroup?.branch ?? null}
          createdBy={createdBy}
          lastMessageAt={lastMessageAt}
          sessionGroupName={sessionGroupName ?? sessionGroup?.name ?? null}
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
}: {
  branch: string | null;
  createdBy: SidebarUserRef | undefined;
  lastMessageAt: string | null | undefined;
  sessionGroupName: string | null;
}) {
  const ownerName = formatOwnerName(createdBy);
  const ownerEmail = createdBy?.email && createdBy.email !== ownerName ? createdBy.email : null;

  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold leading-snug text-foreground">
        {sessionGroupName ?? "Untitled group"}
      </h3>

      <div className="mt-1 flex items-center justify-between gap-4 text-xs text-foreground/65">
        <p className="min-w-0 truncate">{formatLastMessage(lastMessageAt)}</p>
        {branch && <p className="max-w-[45%] shrink-0 truncate text-right">{branch}</p>}
      </div>

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
