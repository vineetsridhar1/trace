import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";

export type SessionGroupRow = SessionGroupEntity & {
  id: string;
  status: string;
  reviewAndActive?: boolean;
  latestSession?: SessionEntity;
  createdBySession?: SessionEntity;
  _lastMessageAt?: string;
  _sortTimestamp?: string;
  _sessionCount: number;
};

export const COMPACT_BREAKPOINT = 600;
export const FILTER_STORAGE_KEY_PREFIX = "trace:sessions-filter:";

const BUCKET_MS = 2 * 60 * 1000;
export function bucketize(ts: string | undefined): number {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return Math.floor(t / BUCKET_MS) * BUCKET_MS;
}

export const collapsedByDefault = new Set(["merged", "failed"]);

export const statusGroupOrder: Record<string, number> = {
  needs_input: 0,
  creating: 1,
  active: 2,
  completed: 3,
  paused: 4,
  pending: 5,
  in_review: 6,
  merged: 7,
  failed: 8,
  unreachable: 9,
};
