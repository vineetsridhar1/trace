import { useStoreWithEqualityFn } from "zustand/traditional";
import { useEntityStore, type EntityState } from "@trace/client-core";
import type { SessionGroupEntity, SessionEntity } from "@trace/client-core";
import { getSessionGroupChannelId } from "@trace/client-core";
import {
  getSessionGroupDisplayStatus,
  getSessionGroupAgentStatus,
} from "../session/sessionStatus";
import type { SessionGroupRow } from "./sessions-table-types";

type SessionGroupRowSelection = {
  row: SessionGroupRow;
  signature: string;
};

function getSessionMessageTimestamp(session: SessionEntity | undefined): string | undefined {
  return (
    session?.lastMessageAt
    ?? session?.lastUserMessageAt
    ?? undefined
  );
}

function getSessionSortTimestamp(session: SessionEntity | undefined): string | undefined {
  return (
    session?._sortTimestamp
    ?? getSessionMessageTimestamp(session)
    ?? session?.updatedAt
    ?? session?.createdAt
  );
}

function buildRowSignature(row: SessionGroupRow): string {
  const latestSession = row.latestSession;
  const latestRepo = (latestSession?.repo as { id?: string; name?: string } | null | undefined) ?? null;
  const groupRepo = (row.repo as { id?: string; name?: string } | null | undefined) ?? null;
  const createdBy = (row.createdBySession?.createdBy as
    | { id?: string; name?: string; avatarUrl?: string | null }
    | undefined) ?? null;

  return [
    row.id,
    row.name,
    row.slug ?? "",
    row.status ?? "",
    row.branch ?? "",
    row.prUrl ?? "",
    row.archivedAt ?? "",
    row.worktreeDeleted ? "1" : "0",
    row.displaySessionStatus,
    row.displayAgentStatus,
    row._sessionCount,
    row._groupLastMessageAt ?? "",
    row._sortTimestamp ?? "",
    groupRepo?.id ?? "",
    groupRepo?.name ?? "",
    latestSession?.id ?? "",
    latestSession?.name ?? "",
    latestSession?.updatedAt ?? "",
    latestSession?._sortTimestamp ?? "",
    latestSession?.lastMessageAt ?? "",
    latestSession?.agentStatus ?? "",
    latestSession?.sessionStatus ?? "",
    latestRepo?.id ?? "",
    latestRepo?.name ?? "",
    row.createdBySession?.id ?? "",
    createdBy?.id ?? "",
    createdBy?.name ?? "",
    createdBy?.avatarUrl ?? "",
  ].join("|");
}

function areRowSelectionsEqual(
  previous: SessionGroupRowSelection[],
  next: SessionGroupRowSelection[],
): boolean {
  if (previous.length !== next.length) return false;
  for (let i = 0; i < previous.length; i++) {
    if (previous[i]?.signature !== next[i]?.signature) return false;
  }
  return true;
}

export function useSessionGroupRows(
  channelId: string,
  options?: { archived?: boolean; status?: string },
): SessionGroupRow[] {
  const selectedRows = useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): SessionGroupRowSelection[] => {
      const shouldIncludeArchived = options?.archived === true || options?.status === "archived";
      const rows: SessionGroupRowSelection[] = [];

      for (const group of Object.values(state.sessionGroups) as SessionGroupEntity[]) {
        const groupSessionIds = state._sessionIdsByGroup[group.id] ?? [];
        const groupSessions = groupSessionIds
          .map((id: string) => state.sessions[id])
          .filter(Boolean)
          .sort((a: SessionEntity, b: SessionEntity) => {
            const aSort = getSessionSortTimestamp(a) ?? "";
            const bSort = getSessionSortTimestamp(b) ?? "";
            const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id);
          });

        if (getSessionGroupChannelId(group, groupSessions) !== channelId) {
          continue;
        }

        const latestSession = groupSessions[0];
        const latestMessageSession = groupSessions.reduce<SessionEntity | undefined>(
          (best, session) => {
            const ts = getSessionMessageTimestamp(session);
            if (!ts) return best;
            const bestTs = best ? getSessionMessageTimestamp(best) : undefined;
            if (!bestTs || ts > bestTs) return session;
            return best;
          },
          undefined,
        );
        const createdBySession = [...groupSessions].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0];
        const agentStatuses = groupSessions.map((session: SessionEntity) => session.agentStatus);
        const sessionStatuses = groupSessions.map((session: SessionEntity) => session.sessionStatus);
        const prUrl = group.prUrl as string | null | undefined;
        const archivedAt = group.archivedAt as string | null | undefined;
        const displaySessionStatus =
          groupSessions.length > 0
            ? getSessionGroupDisplayStatus(sessionStatuses, agentStatuses, prUrl, archivedAt)
            : ((group.status as string | undefined) ?? "in_progress");
        const displayAgentStatus = archivedAt
          ? "stopped"
          : getSessionGroupAgentStatus(agentStatuses);

        const row = {
          ...group,
          latestSession,
          createdBySession,
          displaySessionStatus,
          displayAgentStatus,
          _sessionCount: groupSessions.length,
          _groupLastMessageAt:
            getSessionMessageTimestamp(latestMessageSession)
            ?? group.createdAt,
          _sortTimestamp:
            getSessionSortTimestamp(latestSession)
            ?? group._sortTimestamp
            ?? group.updatedAt,
        } as SessionGroupRow;

        if (shouldIncludeArchived) {
          if (!group.archivedAt) continue;
        } else if (group.archivedAt) {
          continue;
        }

        if (options?.status) {
          if (row.displaySessionStatus !== options.status) continue;
        } else if (row.displaySessionStatus === "merged") {
          continue;
        }

        rows.push({ row, signature: buildRowSignature(row) });
      }

      rows.sort((a, b) => {
        const aSort = a.row._sortTimestamp ?? a.row.updatedAt ?? a.row.createdAt;
        const bSort = b.row._sortTimestamp ?? b.row.updatedAt ?? b.row.createdAt;
        const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
        if (diff !== 0) return diff;
        return a.row.id.localeCompare(b.row.id);
      });

      return rows;
    },
    areRowSelectionsEqual,
  );

  return selectedRows.map(({ row }: SessionGroupRowSelection) => row);
}
