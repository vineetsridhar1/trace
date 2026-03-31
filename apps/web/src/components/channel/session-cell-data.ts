import type { SessionGroupRow } from "./sessions-table-types";

export type RepoRef = { id: string; name: string };
export type CreatedByRef = { id: string; name: string; avatarUrl?: string | null };

export function getSessionRepo(data: SessionGroupRow | undefined): RepoRef | null {
  if (!data) return null;
  return (
    (data.repo as RepoRef | null | undefined)
    ?? (data.latestSession?.repo as RepoRef | null | undefined)
    ?? null
  );
}

export function getSessionCreatedBy(data: SessionGroupRow | undefined): CreatedByRef | null {
  if (!data) return null;
  return (data.createdBySession?.createdBy as CreatedByRef | undefined) ?? null;
}

export function getSessionLastActivityAt(data: SessionGroupRow | undefined): string | undefined {
  return data?._sortTimestamp ?? data?._lastMessageAt ?? data?.updatedAt ?? data?.createdAt;
}
