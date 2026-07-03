import { eventScopeKey, type EntityState } from "@trace/client-core/headless";
import type { ClientRuntime } from "../runtime.js";
import { diffNodes } from "./node-diff.js";
import { toProtocolNodes, type ProtocolNode } from "./protocol-nodes.js";
import {
  channelSnapshots,
  sessionSnapshots,
  ticketSnapshots,
  type SessionSnapshot,
} from "./snapshots.js";

const BADGE_DEBOUNCE_MS = 100;

export interface Notifier {
  notify: (method: string, params: Record<string, unknown>) => void;
}

/** Watches the entity store after hydration and pushes the daemon's
 *  notification set: entity/upserted, badge/update, session/nodes. */
export class StoreNotifications {
  private readonly trackedSessions = new Map<string, ProtocolNode[]>();
  private previous: EntityState;
  private unsubscribe: (() => void) | null = null;
  private badgeTimer: NodeJS.Timeout | null = null;
  private lastBadge = "";

  constructor(
    private readonly runtime: ClientRuntime,
    private readonly notifier: Notifier,
  ) {
    this.previous = runtime.stores.entity.getState();
  }

  start(): void {
    this.unsubscribe = this.runtime.stores.entity.subscribe((state, previousState) => {
      this.emitEntityUpserts(state, previousState);
      this.flushSessionNodes(state);
      this.scheduleBadgeUpdate(state);
    });
    // Post-hydration baseline so editors always know the current counts.
    const badge = this.computeBadge(this.runtime.stores.entity.getState());
    this.lastBadge = JSON.stringify(badge);
    this.notifier.notify("badge/update", badge);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.badgeTimer) {
      clearTimeout(this.badgeTimer);
      this.badgeTimer = null;
    }
    this.trackedSessions.clear();
  }

  /** Begin streaming session/nodes for a scope; emits the current transcript
   *  as the initial append so subscribers never miss a window. */
  trackSession(sessionId: string): void {
    this.trackedSessions.set(sessionId, []);
    this.flushSessionNodes(this.runtime.stores.entity.getState());
  }

  untrackSession(sessionId: string): void {
    this.trackedSessions.delete(sessionId);
  }

  private emitEntityUpserts(state: EntityState, previousState: EntityState): void {
    this.emitTableUpserts(state, previousState, "sessions", (snapshotState, id) =>
      sessionSnapshots(snapshotState).find((snapshot) => snapshot.id === id),
    );
    this.emitTableUpserts(state, previousState, "channels", (snapshotState, id) =>
      channelSnapshots(snapshotState).find((snapshot) => snapshot.id === id),
    );
    this.emitTableUpserts(state, previousState, "tickets", (snapshotState, id) =>
      ticketSnapshots(snapshotState).find((snapshot) => snapshot.id === id),
    );
  }

  private emitTableUpserts(
    state: EntityState,
    previousState: EntityState,
    type: "sessions" | "channels" | "tickets",
    snapshot: (state: EntityState, id: string) => unknown,
  ): void {
    const table = state[type] as Record<string, unknown>;
    const previousTable = previousState[type] as Record<string, unknown>;
    if (table === previousTable) return;
    for (const id of Object.keys(table)) {
      if (table[id] !== previousTable[id]) {
        const entity = snapshot(state, id);
        if (entity) {
          this.notifier.notify("entity/upserted", { type, entity });
        }
      }
    }
  }

  private flushSessionNodes(state: EntityState): void {
    for (const [sessionId, emitted] of this.trackedSessions) {
      const scopeKey = eventScopeKey("session", sessionId);
      const ids = state._eventIdsByScope[scopeKey] ?? [];
      const events = state.eventsByScope[scopeKey] ?? {};
      const next = toProtocolNodes(ids, events);
      const delta = diffNodes(emitted, next);
      if (delta) {
        this.notifier.notify("session/nodes", { sessionId, ...delta });
        this.trackedSessions.set(sessionId, next);
      }
    }
  }

  private computeBadge(state: EntityState): { needsInputCount: number; mentionCount: number } {
    const needsInputCount = Object.values(state.sessions).filter(
      (session) => session.sessionStatus === "needs_input",
    ).length;
    const mentionCount = Object.values(state.inboxItems).filter((item) => !item.resolvedAt).length;
    return { needsInputCount, mentionCount };
  }

  private scheduleBadgeUpdate(state: EntityState): void {
    if (this.badgeTimer) return;
    this.badgeTimer = setTimeout(() => {
      this.badgeTimer = null;
      const badge = this.computeBadge(this.runtime.stores.entity.getState());
      const key = JSON.stringify(badge);
      if (key !== this.lastBadge) {
        this.lastBadge = key;
        this.notifier.notify("badge/update", badge);
      }
    }, BADGE_DEBOUNCE_MS);
    this.badgeTimer.unref?.();
    void state;
  }

  /** Test/inspection helper: currently tracked session IDs. */
  tracked(): string[] {
    return [...this.trackedSessions.keys()];
  }
}

export interface SessionSnapshotLookup {
  session: SessionSnapshot | undefined;
}
