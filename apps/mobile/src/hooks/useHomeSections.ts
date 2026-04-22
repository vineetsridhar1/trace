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
  /** Session group IDs */
  ids: string[];
}

const RECENTLY_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENTLY_DONE_MAX = 15;

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

function sessionRepoId(session: SessionEntity): string | null {
  const repo = session.repo as { id?: string } | null | undefined;
  return typeof repo?.id === "string" ? repo.id : null;
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

export interface HomeRepoOption {
  id: string;
  name: string;
}

interface HomeSectionsResult {
  sections: HomeSection[];
  /** Repo options derived from visible groups (only populated when collectRepos=true) */
  repos: HomeRepoOption[];
}

/**
 * Core computation shared by `useHomeSections` and `useHomeRepos`.
 * Returns the three ordered buckets of session group IDs for the home tab,
 * applying ownership, visibility, repo, cutoff, and cap rules consistently.
 *
 * When `collectRepos` is true, also collects distinct repos from the unfiltered
 * (no repoId) visible groups in a single pass, avoiding a second full traversal.
 */
function buildHomeSections(
  state: EntityState,
  userId: string,
  repoId: string | null,
  collectRepos = false,
): HomeSectionsResult {
  // Per-group accumulators: track the best bucket and sort key for each group.
  const groupNeedsInput = new Map<string, { rank: number; ts: number }>();
  const groupWorking = new Map<string, { ts: number }>();
  const groupDone = new Map<string, { ts: number }>();
  // When collectRepos=true, track the first repo seen per group (keyed by groupId).
  // After sectioning we look up repos only for groups that made it into a section.
  const groupRepo = collectRepos ? new Map<string, { id: string; name: string }>() : null;

  const cutoff = Date.now() - RECENTLY_DONE_WINDOW_MS;

  for (const session of Object.values(state.sessions) as SessionEntity[]) {
    if (!ownedBy(session, userId)) continue;
    if (hiddenFromHome(state, session)) continue;

    // Track repo per group (unfiltered by repoId) for later chip collection.
    if (groupRepo) {
      const gid = session.sessionGroupId;
      if (gid && !groupRepo.has(gid)) {
        const repo = session.repo as { id?: string; name?: string } | null | undefined;
        if (repo?.id) groupRepo.set(gid, { id: repo.id, name: repo.name ?? repo.id });
      }
    }

    if (repoId && sessionRepoId(session) !== repoId) continue;

    // Sessions always have a group ID; guard is for type narrowing.
    const groupId = session.sessionGroupId;
    if (!groupId) continue;

    const sortTs = sortTimestamp(session);

    if (session.sessionStatus === "needs_input") {
      const meta = pendingMeta(state, session.id, sortTs);
      const existing = groupNeedsInput.get(groupId);
      if (!existing || meta.rank < existing.rank || (meta.rank === existing.rank && meta.ts > existing.ts)) {
        groupNeedsInput.set(groupId, { rank: meta.rank, ts: meta.ts });
      }
      continue;
    }

    if (session.agentStatus === "active") {
      const existing = groupWorking.get(groupId);
      if (!existing || sortTs > existing.ts) {
        groupWorking.set(groupId, { ts: sortTs });
      }
      continue;
    }

    const isDone = session.agentStatus === "done" || session.sessionStatus === "in_review";
    if (isDone) {
      const updatedTs = timestampMs(session.updatedAt);
      if (updatedTs >= cutoff) {
        const existing = groupDone.get(groupId);
        if (!existing || updatedTs > existing.ts) {
          groupDone.set(groupId, { ts: updatedTs });
        }
      }
    }
  }

  // A group in needs_input or working_now should not also appear in recently_done.
  for (const id of groupNeedsInput.keys()) groupDone.delete(id);
  for (const id of groupWorking.keys()) groupDone.delete(id);

  const needsInput = Array.from(groupNeedsInput, ([id, v]) => ({ id, ...v }));
  const working = Array.from(groupWorking, ([id, v]) => ({ id, ...v }));
  const done = Array.from(groupDone, ([id, v]) => ({ id, ...v }));

  needsInput.sort((a, b) => a.rank - b.rank || b.ts - a.ts || a.id.localeCompare(b.id));
  working.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  done.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));

  const buckets: Record<HomeSectionKind, string[]> = {
    needs_input: needsInput.map((x) => x.id),
    working_now: working.map((x) => x.id),
    recently_done: done.slice(0, RECENTLY_DONE_MAX).map((x) => x.id),
  };

  const sections: HomeSection[] = [];
  for (const kind of SECTION_ORDER) {
    const ids = buckets[kind];
    if (ids.length > 0) sections.push({ kind, ids });
  }

  let repos: HomeRepoOption[] = [];
  if (groupRepo) {
    // Collect repos only from groups that made it into a section (i.e. are visible).
    const repoById = new Map<string, string>();
    for (const section of sections) {
      for (const gid of section.ids) {
        const r = groupRepo.get(gid);
        if (r && !repoById.has(r.id)) repoById.set(r.id, r.name);
      }
    }
    repos = Array.from(repoById, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  return { sections, repos };
}

/**
 * Three buckets of session groups belonging to `userId` for the Home tab:
 *  1. Needs you — any session in the group has `sessionStatus === "needs_input"`,
 *     sorted by pending-event urgency (question_pending first, then plan_pending),
 *     then recency.
 *  2. Working now — any session in the group has `agentStatus === "active"`,
 *     sorted by `_sortTimestamp` desc.
 *  3. Recently done — most recent session has `agentStatus === "done"` or
 *     `sessionStatus === "in_review"` within the trailing 24h, sorted by recency
 *     desc and capped at 15 groups.
 *
 * Merged sessions and sessions in merged/archived groups are hidden from Home.
 * When `repoId` is non-null, sessions whose `repo.id` doesn't match are also
 * filtered out. Empty buckets are omitted. Uses a custom equality fn so the
 * hook only triggers a render when the membership/order actually changes.
 */
export function useHomeSections(
  userId: string | null,
  repoId: string | null = null,
): HomeSection[] {
  return useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): HomeSection[] => {
      if (!userId) return [];
      return buildHomeSections(state, userId, repoId).sections;
    },
    areSectionsEqual,
  );
}

function areRepoOptionsEqual(a: HomeRepoOption[], b: HomeRepoOption[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id || a[i]!.name !== b[i]!.name) return false;
  }
  return true;
}

/**
 * Distinct repos referenced by groups currently visible in the home tab
 * (i.e. groups that appear in at least one section), sorted by name.
 * Drives the home repo filter chip row — only repos with at least one visible
 * group are shown, so filtering to any chip will always produce a non-empty
 * list. Uses `buildHomeSections` with `collectRepos=true` so both the section
 * classification and repo collection happen in a single session-store pass.
 */
export function useHomeRepos(userId: string | null): HomeRepoOption[] {
  return useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): HomeRepoOption[] => {
      if (!userId) return [];
      return buildHomeSections(state, userId, null, true).repos;
    },
    areRepoOptionsEqual,
  );
}
