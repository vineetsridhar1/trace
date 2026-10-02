import { create } from "zustand";
import { gql } from "urql";
import type { SessionPullRequestStatus } from "@trace/gql";
import { client } from "../lib/urql";

const query = gql`
  query SessionGroupPullRequestStatuses($ids: [ID!]!) {
    sessionGroupPullRequestStatuses(ids: $ids) {
      prUrl
      review
      checks
    }
  }
`;
const REFRESH_INTERVAL = 30_000;
export const usePullRequestStatusStore = create<{
  statuses: Record<string, SessionPullRequestStatus | null>;
}>(() => ({ statuses: {} }));

type Entry = { id: string; prUrl: string; count: number; due: number };

function createPoller() {
  const entries = new Map<string, Entry>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const hidden = () => typeof document !== "undefined" && document.hidden;
  const schedule = () => {
    clearTimeout(timer);
    if (running || !entries.size || hidden()) return;
    const due = Math.min(...[...entries.values()].map((entry) => entry.due));
    // Coalesce rows mounted in the same render into one request.
    timer = setTimeout(() => void refresh(), Math.max(100, due - Date.now()));
  };
  const refresh = async () => {
    if (hidden()) return;
    running = true;
    const due = [...entries].filter(([, entry]) => entry.due <= Date.now());
    try {
      for (let offset = 0; offset < due.length; offset += 100) {
        const batch = due
          .slice(offset, offset + 100)
          .filter(([key, entry]) => entries.get(key) === entry);
        if (!batch.length || hidden()) break;
        let statuses: SessionPullRequestStatus[] = [];
        try {
          const result = await client
            .query<{
              sessionGroupPullRequestStatuses: SessionPullRequestStatus[];
            }>(
              query,
              { ids: [...new Set(batch.map(([, entry]) => entry.id))] },
              { requestPolicy: "network-only" },
            )
            .toPromise();
          if (!result.error) statuses = result.data?.sessionGroupPullRequestStatuses ?? [];
        } catch {
          /* Clear stale results on a failed refresh. */
        }
        const byUrl = new Map(statuses.map((status) => [status.prUrl, status]));
        usePullRequestStatusStore.setState((state) => {
          const next = { ...state.statuses };
          for (const [key, entry] of batch) {
            if (entries.get(key) !== entry) continue;
            next[key] = byUrl.get(entry.prUrl) ?? null;
            entry.due = Date.now() + REFRESH_INTERVAL;
          }
          return { statuses: next };
        });
      }
    } finally {
      running = false;
      schedule();
    }
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", schedule);
  return {
    entries,
    schedule,
    stop: () => {
      clearTimeout(timer);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", schedule);
    },
  };
}

// A single scheduler per viewer serves every displayed sidebar/table row.
const pollers = new Map<string, ReturnType<typeof createPoller>>();
export function subscribePullRequestStatus(id: string, prUrl: string, userId: string) {
  const key = JSON.stringify([userId, id, prUrl]);
  let poller = pollers.get(userId);
  if (!poller) {
    poller = createPoller();
    pollers.set(userId, poller);
  }
  const entry = poller.entries.get(key) ?? { id, prUrl, count: 0, due: 0 };
  entry.count++;
  poller.entries.set(key, entry);
  poller.schedule();
  return () => {
    if (--entry.count > 0) return;
    poller.entries.delete(key);
    if (!poller.entries.size) {
      poller.stop();
      pollers.delete(userId);
    } else poller.schedule();
    usePullRequestStatusStore.setState((state) => {
      const statuses = { ...state.statuses };
      delete statuses[key];
      return { statuses };
    });
  };
}
