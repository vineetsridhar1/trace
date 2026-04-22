import { useStoreWithEqualityFn } from "zustand/traditional";
import { asJsonObject } from "@trace/shared";
import {
  eventScopeKey,
  useEntityStore,
  type EntityState,
  type SessionEntity,
} from "@trace/client-core";

export type HomeSectionKind = "needs_input" | "working_now" | "recently_done";

export interface HomeSection {
  kind: HomeSectionKind;
  ids: string[];
}

const RECENTLY_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortTimestamp(session: SessionEntity): number {
  return timestampMs(
    session._sortTimestamp ?? session.lastMessageAt ?? session.updatedAt ?? session.createdAt,
  );
}

function ownedBy(session: SessionEntity, userId: string): boolean {
  const createdBy = session.createdBy as { id?: string } | undefined | null;
  return typeof createdBy?.id === "string" && createdBy.id === userId;
}

function hiddenFromHome(state: EntityState, session: SessionEntity): boolean {
  if (session.sessionStatus === "merged") return true;

  const storedGroup = session.sessionGroupId
    ? state.sessionGroups[session.sessionGroupId]
    : undefined;
  const sessionGroup = session.sessionGroup;
  const groupStatus = storedGroup?.status ?? sessionGroup?.status;
  const archivedAt = storedGroup?.archivedAt ?? sessionGroup?.archivedAt;

  return Boolean(archivedAt) || groupStatus === "archived" || groupStatus === "merged";
}

interface PendingMeta {
  /** 0 = question_pending (most urgent), 1 = plan_pending, 2 = neither found */
  rank: number;
  /** Timestamp of the most recent pending event found, or session sort fallback */
  ts: number;
}

/**
 * Walks the session's scoped event bucket to find the most recent
 * `question_pending` / `plan_pending` event. The home selector only consults
 * this for sessions already filtered to `needs_input`, so the per-session
 * iteration cost stays bounded to those sessions' event buckets.
 */
function pendingMeta(state: EntityState, sessionId: string, fallbackTs: number): PendingMeta {
  const bucket = state.eventsByScope[eventScopeKey("session", sessionId)];
  if (!bucket) return { rank: 2, ts: fallbackTs };

  let bestRank = 2;
  let bestTs = -Infinity;
  for (const event of Object.values(bucket)) {
    if (event.eventType !== "session_output") continue;
    const payload = asJsonObject(event.payload);
    const type = payload?.type;
    if (type !== "question_pending" && type !== "plan_pending") continue;
    const ts = timestampMs(event.timestamp);
    if (ts < bestTs) continue;
    // Same-timestamp tiebreak prefers the more urgent rank.
    const rank = type === "question_pending" ? 0 : 1;
    if (ts > bestTs || rank < bestRank) {
      bestTs = ts;
      bestRank = rank;
    }
  }

  return bestRank === 2
    ? { rank: 2, ts: fallbackTs }
    : { rank: bestRank, ts: bestTs };
}

function areSectionsEqual(a: HomeSection[], b: HomeSection[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i]!;
    const sb = b[i]!;
    if (sa.kind !== sb.kind) return false;
    if (sa.ids.length !== sb.ids.length) return false;
    for (let j = 0; j < sa.ids.length; j++) {
      if (sa.ids[j] !== sb.ids[j]) return false;
    }
  }
  return true;
}

const SECTION_ORDER: HomeSectionKind[] = ["needs_input", "working_now", "recently_done"];

/**
 * Three buckets of sessions belonging to `userId` for the Home tab:
 *  1. Needs you — `sessionStatus === "needs_input"`, sorted by pending-event
 *     urgency (question_pending first, then plan_pending), then recency.
 *  2. Working now — `agentStatus === "active"`, sorted by `_sortTimestamp` desc.
 *  3. Recently done — `agentStatus === "done"` or `sessionStatus === "in_review"`
 *     with `updatedAt` inside the trailing 24h, sorted by recency desc.
 *
 * Merged sessions and sessions in merged/archived groups are hidden from Home.
 * Empty buckets are omitted. Uses a custom equality fn so the hook only
 * triggers a render when the membership/order actually changes.
 */
export function useHomeSections(userId: string | null): HomeSection[] {
  return useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): HomeSection[] => {
      if (!userId) return [];

      const needsInput: Array<{ id: string; rank: number; ts: number }> = [];
      const working: Array<{ id: string; ts: number }> = [];
      const done: Array<{ id: string; ts: number }> = [];

      const cutoff = Date.now() - RECENTLY_DONE_WINDOW_MS;

      for (const session of Object.values(state.sessions) as SessionEntity[]) {
        if (!ownedBy(session, userId)) continue;
        if (hiddenFromHome(state, session)) continue;

        const sortTs = sortTimestamp(session);

        if (session.sessionStatus === "needs_input") {
          const meta = pendingMeta(state, session.id, sortTs);
          needsInput.push({ id: session.id, rank: meta.rank, ts: meta.ts });
          continue;
        }

        if (session.agentStatus === "active") {
          working.push({ id: session.id, ts: sortTs });
          continue;
        }

        const isDone = session.agentStatus === "done" || session.sessionStatus === "in_review";
        if (isDone) {
          const updatedTs = timestampMs(session.updatedAt);
          if (updatedTs >= cutoff) {
            done.push({ id: session.id, ts: updatedTs });
          }
        }
      }

      needsInput.sort((a, b) => a.rank - b.rank || b.ts - a.ts || a.id.localeCompare(b.id));
      working.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
      done.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));

      const buckets: Record<HomeSectionKind, string[]> = {
        needs_input: needsInput.map((x) => x.id),
        working_now: working.map((x) => x.id),
        recently_done: done.map((x) => x.id),
      };

      const sections: HomeSection[] = [];
      for (const kind of SECTION_ORDER) {
        const ids = buckets[kind];
        if (ids.length > 0) sections.push({ kind, ids });
      }
      return sections;
    },
    areSectionsEqual,
  );
}
