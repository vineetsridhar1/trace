import type { SessionGroupEntity } from "@trace/client-core";
import type { SessionGroup } from "@trace/gql";

function mergeObject(
  existing: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (next === undefined) return existing;
  if (next === null) return null;
  return existing ? { ...existing, ...next } : next;
}

export function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function latestTimestamp(
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | undefined {
  if (!current) return candidate ?? undefined;
  if (!candidate) return current;
  return timestampMs(candidate) > timestampMs(current) ? candidate : current;
}

export function mergeSessionGroupEntity(
  existing: SessionGroupEntity | undefined,
  group: SessionGroup & { id: string },
  sortTimestamp: string | null | undefined,
): SessionGroupEntity & { id: string } {
  return {
    ...(existing ?? {}),
    ...group,
    repo: mergeObject(
      existing?.repo as Record<string, unknown> | null | undefined,
      group.repo as Record<string, unknown> | null | undefined,
    ),
    channel: mergeObject(
      existing?.channel as Record<string, unknown> | null | undefined,
      group.channel as Record<string, unknown> | null | undefined,
    ),
    connection: mergeObject(
      existing?.connection as Record<string, unknown> | null | undefined,
      group.connection as Record<string, unknown> | null | undefined,
    ),
    _sortTimestamp: latestTimestamp(existing?._sortTimestamp, sortTimestamp ?? group.updatedAt),
  } as SessionGroupEntity & { id: string };
}
