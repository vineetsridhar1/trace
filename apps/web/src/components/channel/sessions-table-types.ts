import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";

export type SessionGroupRow = SessionGroupEntity & {
  id: string;
  displaySessionStatus: string;
  displayAgentStatus: string;
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

export const collapsedByDefault = new Set(["merged", "failed", "stopped"]);

export const sessionStatusGroupOrder: Record<string, number> = {
  needs_input: 0,
  in_review: 1,
  in_progress: 2,
  failed: 3,
  stopped: 4,
  merged: 5,
};
