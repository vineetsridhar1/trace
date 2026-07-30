import type { InboxItem, SessionGroupKind } from "@trace/gql";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";

export type HomeWorkBucket = "in_progress" | "needs_you" | "done_today";

export interface HomeWorkItem {
  id: string;
  groupId: string;
  sessionId: string | null;
  channelId: string | null;
  kind: SessionGroupKind;
  title: string;
  bucket: HomeWorkBucket;
  agentStatus: string;
  sessionStatus: string;
  statusText: string;
  repoName: string | null;
  activityAt: string;
  owner: { id: string; name: string; avatarUrl?: string | null } | null;
  inboxItem: InboxItem | null;
  prUrl: string | null;
}

export interface HomeWorkData {
  items: HomeWorkItem[];
  totalOwnedOrParticipating: number;
}

interface BuildHomeWorkDataInput {
  currentUserId: string | null;
  groups: Record<string, SessionGroupEntity>;
  sessions: Record<string, SessionEntity>;
  sessionIdsByGroup: Record<string, string[]>;
  inboxItems: Record<string, InboxItem>;
  now?: Date;
}

export function buildHomeWorkData({
  currentUserId,
  groups,
  sessions,
  sessionIdsByGroup,
  inboxItems,
  now = new Date(),
}: BuildHomeWorkDataInput): HomeWorkData {
  if (!currentUserId) return { items: [], totalOwnedOrParticipating: 0 };

  const activeInbox = Object.values(inboxItems).filter(
    (item) => item.userId === currentUserId && item.status === "active",
  );
  const items: HomeWorkItem[] = [];
  let totalOwnedOrParticipating = 0;

  for (const group of Object.values(groups)) {
    const groupSessions = (sessionIdsByGroup[group.id] ?? [])
      .map((id) => sessions[id])
      .filter((session): session is SessionEntity => Boolean(session))
      .sort(compareSessionsByActivity);
    const participates =
      group.owner?.id === currentUserId ||
      groupSessions.some((session) => session.createdBy?.id === currentUserId);
    if (!participates) continue;

    totalOwnedOrParticipating += 1;
    const latestSession = groupSessions[0] ?? null;
    const activityAt =
      latestSession?.lastMessageAt ??
      latestSession?.lastUserMessageAt ??
      latestSession?.updatedAt ??
      group._sortTimestamp ??
      group.updatedAt ??
      group.createdAt;
    const status = resolveStatus(group, groupSessions);
    const bucket = resolveBucket(status, group.archivedAt ?? null, activityAt, now);
    if (!bucket) continue;

    const groupSessionIds = new Set(groupSessions.map((session) => session.id));
    const inboxItem =
      activeInbox.find(
        (item) => item.sourceId === group.id || groupSessionIds.has(item.sourceId),
      ) ?? null;
    const agentStatus = latestSession?.agentStatus ?? status;
    const sessionStatus = latestSession?.sessionStatus ?? status;

    items.push({
      id: group.id,
      groupId: group.id,
      sessionId: latestSession?.id ?? null,
      channelId: group.channel?.id ?? latestSession?.channel?.id ?? null,
      kind: group.kind ?? "coding",
      title: group.name || group.slug || latestSession?.name || "Untitled session",
      bucket,
      agentStatus,
      sessionStatus,
      statusText: statusText(group, latestSession, status, inboxItem),
      repoName: group.repo?.name ?? latestSession?.repo?.name ?? null,
      activityAt,
      owner: group.owner ?? latestSession?.createdBy ?? null,
      inboxItem,
      prUrl: group.prUrl ?? latestSession?.prUrl ?? null,
    });
  }

  items.sort((a, b) => {
    const difference = new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime();
    return difference || a.id.localeCompare(b.id);
  });

  return { items, totalOwnedOrParticipating };
}

function compareSessionsByActivity(a: SessionEntity, b: SessionEntity): number {
  const aTime = a.lastMessageAt ?? a.lastUserMessageAt ?? a.updatedAt ?? a.createdAt;
  const bTime = b.lastMessageAt ?? b.lastUserMessageAt ?? b.updatedAt ?? b.createdAt;
  return new Date(bTime).getTime() - new Date(aTime).getTime();
}

function resolveStatus(group: SessionGroupEntity, sessions: SessionEntity[]): string {
  if (group.archivedAt) return "archived";
  if (group.status === "merged" || sessions.some((session) => session.sessionStatus === "merged")) {
    return "merged";
  }
  if (
    group.status === "needs_input" ||
    sessions.some((session) => session.sessionStatus === "needs_input")
  ) {
    return "needs_input";
  }
  if (
    group.status === "in_review" ||
    group.prUrl ||
    sessions.some((session) => session.sessionStatus === "in_review" || session.prUrl)
  ) {
    return "in_review";
  }
  if (group.status === "failed" || sessions.some((session) => session.agentStatus === "failed")) {
    return "failed";
  }
  if (group.status === "stopped" || sessions.some((session) => session.agentStatus === "stopped")) {
    return "stopped";
  }
  return "in_progress";
}

function resolveBucket(
  status: string,
  archivedAt: string | null,
  activityAt: string,
  now: Date,
): HomeWorkBucket | null {
  if (status === "needs_input" || status === "in_review") return "needs_you";
  if (status === "merged" || status === "archived") {
    const completedAt = archivedAt ?? activityAt;
    return isSameLocalDay(completedAt, now) ? "done_today" : null;
  }
  return "in_progress";
}

function isSameLocalDay(value: string, now: Date): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function statusText(
  group: SessionGroupEntity,
  session: SessionEntity | null,
  status: string,
  inboxItem: InboxItem | null,
): string {
  if (status === "failed") {
    const error = group.setupError ?? session?.connection?.lastError;
    return `✕ ${error || "agent run failed"}`;
  }
  if (status === "stopped") return "Stopped by you · worktree kept";
  if (status === "needs_input") {
    return inboxItem?.summary ?? inboxItem?.title ?? "Waiting for your input";
  }
  if (status === "in_review") {
    return inboxItem?.summary ?? inboxItem?.title ?? "Ready for review";
  }
  if (status === "merged") return "Merged · work complete";
  if (status === "archived") return "Completed · closed today";
  if (session?.agentStatus === "active") {
    const preview = session._lastEventPreview?.trim();
    return preview ? `▸ ${preview.replace(/^▸\s*/, "")}` : "▸ agent is working";
  }
  if (session?.agentStatus === "not_started") return "▸ preparing workspace";
  if (session?.agentStatus === "done") return "▸ ready for your next prompt";
  return "▸ session in progress";
}
