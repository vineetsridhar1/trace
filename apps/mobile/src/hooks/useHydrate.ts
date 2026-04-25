import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { gql } from "@urql/core";
import {
  getPlatform,
  handleOrgEvent,
  useAuthStore,
  useEntityStore,
  type AuthState,
  type SessionGroupEntity,
} from "@trace/client-core";
import type { Channel, ChannelGroup, Event, Session, SessionGroup } from "@trace/gql";
import { isUnauthorized } from "@/lib/auth";
import { latestTimestamp, mergeSessionGroupEntity } from "@/lib/session-group";
import { userFacingError } from "@/lib/requestError";
import { timedEventIngest } from "@/lib/perf";
import { getClient } from "@/lib/urql";
import { useConnectionStore, type ConnectionState } from "@/stores/connection";
import { useMobileUIStore } from "@/stores/ui";

const ORGANIZATION_QUERY = gql`
  query MobileOrganization($id: ID!) {
    organization(id: $id) {
      id
      name
      channels {
        id
        name
        type
        position
        groupId
        baseBranch
        repo { id name }
      }
    }
  }
`;

const CHANNEL_GROUPS_QUERY = gql`
  query MobileChannelGroups($organizationId: ID!) {
    channelGroups(organizationId: $organizationId) {
      id
      name
      position
      isCollapsed
    }
  }
`;

const MY_SESSIONS_QUERY = gql`
  query MobileMySessions(
    $organizationId: ID!
    $includeMerged: Boolean
    $includeArchived: Boolean
  ) {
    mySessions(
      organizationId: $organizationId
      includeMerged: $includeMerged
      includeArchived: $includeArchived
    ) {
      id
      name
      agentStatus
      sessionStatus
      tool
      model
      hosting
      createdBy { id name avatarUrl }
      repo { id name remoteUrl }
      sessionGroupId
      sessionGroup {
        id
        name
        slug
        status
        branch
        prUrl
        worktreeDeleted
        archivedAt
        setupStatus
        setupError
        createdAt
        updatedAt
        channel { id }
        repo { id name remoteUrl defaultBranch }
      }
      channel { id name }
      branch
      workdir
      prUrl
      worktreeDeleted
      lastUserMessageAt
      lastMessageAt
      queuedMessages { id sessionId text position createdAt }
      createdAt
      updatedAt
    }
  }
`;

const ORG_EVENTS_SUBSCRIPTION = gql`
  subscription MobileOrgEvents($organizationId: ID!) {
    orgEvents(organizationId: $organizationId) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor { type id name avatarUrl }
      parentId
      timestamp
      metadata
    }
  }
`;

const ME_REFRESH_KEY = "trace_me_last_fetched_at";
const ME_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch org data (channels, groups, sessions) and upsert into the entity store.
 * Returns true on success, false if the server returned a 401-equivalent.
 * Shared between initial hydration and manual pull-to-refresh.
 *
 * Guards against stale writes: if the active org changes (or the user signs
 * out) while queries are in flight, the upserts are skipped so the store
 * doesn't get repopulated with the previous org's data after a reset.
 */
export async function refreshOrgData(activeOrgId: string): Promise<boolean> {
  const client = getClient();

  const [orgResult, groupsResult, sessionsResult] = await Promise.all([
    client.query(ORGANIZATION_QUERY, { id: activeOrgId }).toPromise(),
    client.query(CHANNEL_GROUPS_QUERY, { organizationId: activeOrgId }).toPromise(),
    client
      .query(MY_SESSIONS_QUERY, {
        organizationId: activeOrgId,
        includeMerged: false,
        includeArchived: false,
      })
      .toPromise(),
  ]);
  if (
    isUnauthorized(orgResult.error) ||
    isUnauthorized(groupsResult.error) ||
    isUnauthorized(sessionsResult.error)
  ) {
    return false;
  }

  // Bail if the user switched orgs or signed out while we were fetching.
  if (useAuthStore.getState().activeOrgId !== activeOrgId) return true;

  const firstError = orgResult.error ?? groupsResult.error ?? sessionsResult.error;
  useMobileUIStore
    .getState()
    .setOrgDataError(firstError ? userFacingError(firstError, "Couldn't refresh your workspace.") : null);

  const upsertMany = useEntityStore.getState().upsertMany;

  const channels = (orgResult.data?.organization?.channels ?? []) as Array<
    Channel & { id: string }
  >;
  if (channels.length > 0) upsertMany("channels", channels);

  const channelGroups = (groupsResult.data?.channelGroups ?? []) as Array<
    ChannelGroup & { id: string }
  >;
  if (channelGroups.length > 0) upsertMany("channelGroups", channelGroups);

  const sessions = (sessionsResult.data?.mySessions ?? []) as Array<Session & { id: string }>;
  const sessionGroups = sessionGroupsFromSessions(sessions);
  if (sessionGroups.length > 0) upsertMany("sessionGroups", sessionGroups);
  if (sessions.length > 0) upsertMany("sessions", sessions);

  void getPlatform().storage.setItem(ME_REFRESH_KEY, String(Date.now()));
  return true;
}

function sessionGroupsFromSessions(
  sessions: Array<Session & { id: string }>,
): Array<SessionGroupEntity & { id: string }> {
  const existingGroups = useEntityStore.getState().sessionGroups;
  const byId = new Map<string, SessionGroupEntity & { id: string }>();

  for (const session of sessions) {
    const group = session.sessionGroup as (SessionGroup & { id: string }) | null | undefined;
    if (!group?.id) continue;

    const sortTimestamp = session.lastMessageAt ?? session.updatedAt ?? group.updatedAt;
    const current = byId.get(group.id);
    if (current) {
      byId.set(group.id, {
        ...current,
        _sortTimestamp: latestTimestamp(current._sortTimestamp, sortTimestamp),
      });
      continue;
    }

    const existing = existingGroups[group.id];
    byId.set(group.id, mergeSessionGroupEntity(existing, group, sortTimestamp));
  }

  return Array.from(byId.values());
}

export function useHydrate(activeOrgId: string | null): void {
  const logout = useAuthStore((s: AuthState) => s.logout);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    const client = getClient();

    async function handle401() {
      useEntityStore.getState().reset();
      await logout();
    }

    void (async () => {
      const ok = await refreshOrgData(activeOrgId);
      if (cancelled) return;
      if (!ok) await handle401();
    })();

    const subscription = client
      .subscription(ORG_EVENTS_SUBSCRIPTION, { organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: { orgEvents?: Event } }) => {
        if (isUnauthorized(result.error)) {
          void handle401();
          return;
        }
        if (result.error) {
          console.error("[orgEvents] subscription error:", result.error);
        }
        if (!result.data?.orgEvents) return;
        const event = result.data.orgEvents;
        timedEventIngest(event.eventType, () => {
          handleOrgEvent(event);
        });
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [activeOrgId, logout]);

  // Catch up list-level state (sessions, channels, unread counts) after a WS
  // reconnect: the server's in-memory pubsub has no replay, so events emitted
  // while the socket was down are lost to the live subscription.
  const reconnectCounter = useConnectionStore(
    (s: ConnectionState) => s.reconnectCounter,
  );
  const baselineReconnectCounter = useRef(reconnectCounter);
  useEffect(() => {
    if (!activeOrgId) return;
    if (reconnectCounter <= baselineReconnectCounter.current) return;
    baselineReconnectCounter.current = reconnectCounter;
    refreshOrgData(activeOrgId).catch((err: unknown) => {
      console.warn("[hydrate] reconnect refresh failed", err);
    });
  }, [reconnectCounter, activeOrgId]);

  // Re-fetch /auth/me on app foreground if it's been more than 24h since any
  // successful request. Unrelated to WS state — this is a periodic auth-staleness
  // check, independent of the reconnect-driven data refresh above.
  useEffect(() => {
    function onChange(state: AppStateStatus) {
      if (state !== "active") return;
      void (async () => {
        try {
          const last = await getPlatform().storage.getItem(ME_REFRESH_KEY);
          const lastMs = last ? Number(last) : 0;
          if (Date.now() - lastMs < ME_REFRESH_THRESHOLD_MS) return;
          await useAuthStore.getState().fetchMe();
          await getPlatform().storage.setItem(ME_REFRESH_KEY, String(Date.now()));
        } catch (err) {
          console.warn("[hydrate] foreground refresh failed", err);
        }
      })();
    }
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);
}
