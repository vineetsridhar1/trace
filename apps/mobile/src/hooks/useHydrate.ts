import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { gql } from "@urql/core";
import {
  getPlatform,
  handleOrgEvent,
  useAuthStore,
  useEntityStore,
  type SessionGroupEntity,
} from "@trace/client-core";
import type { Channel, ChannelGroup, Event, Session, SessionGroup } from "@trace/gql";
import { handleUnauthorized, isUnauthorized } from "@/lib/auth";
import { reconcileEntitySnapshot, resetEntitySnapshots } from "@/lib/entitySnapshots";
import { latestTimestamp, mergeSessionGroupEntity } from "@/lib/session-group";
import { userFacingError } from "@/lib/requestError";
import { timedEventIngest } from "@/lib/perf";
import { getClient } from "@/lib/urql";
import { useConnectionStore, type ConnectionState } from "@/stores/connection";
import { useRefreshStatusStore } from "@/stores/refresh-status";

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
        repo {
          id
          name
        }
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
  query MobileMySessions($organizationId: ID!, $includeMerged: Boolean, $includeArchived: Boolean) {
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
      createdBy {
        id
        name
        avatarUrl
      }
      repo {
        id
        name
        remoteUrl
      }
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
        channel {
          id
        }
        repo {
          id
          name
          remoteUrl
          defaultBranch
        }
      }
      channel {
        id
        name
      }
      branch
      workdir
      prUrl
      worktreeDeleted
      lastUserMessageAt
      lastMessageAt
      queuedMessages {
        id
        sessionId
        text
        position
        createdAt
      }
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
      actor {
        type
        id
        name
        avatarUrl
      }
      parentId
      timestamp
      metadata
    }
  }
`;

const ME_REFRESH_KEY = "trace_me_last_fetched_at";
const ME_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface RefreshOrgDataResult {
  authorized: boolean;
  channelsError: string | null;
  homeError: string | null;
}

async function doRefreshOrgData(activeOrgId: string): Promise<RefreshOrgDataResult> {
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
    return {
      authorized: false,
      channelsError: null,
      homeError: null,
    };
  }

  // Bail if the user switched orgs or signed out while we were fetching.
  if (useAuthStore.getState().activeOrgId !== activeOrgId) {
    return {
      authorized: true,
      channelsError: null,
      homeError: null,
    };
  }

  const upsertMany = useEntityStore.getState().upsertMany;
  const setOrgStatus = useRefreshStatusStore.getState().setOrgStatus;

  const channels = (orgResult.data?.organization?.channels ?? []) as Array<
    Channel & { id: string }
  >;
  if (orgResult.data?.organization) {
    if (channels.length > 0) upsertMany("channels", channels);
    reconcileEntitySnapshot(
      "channels",
      `org:${activeOrgId}`,
      channels.map((channel) => channel.id),
    );
  }

  const channelGroups = (groupsResult.data?.channelGroups ?? []) as Array<
    ChannelGroup & { id: string }
  >;
  if (groupsResult.data?.channelGroups) {
    if (channelGroups.length > 0) upsertMany("channelGroups", channelGroups);
    reconcileEntitySnapshot(
      "channelGroups",
      `org:${activeOrgId}`,
      channelGroups.map((group) => group.id),
    );
  }

  const sessions = (sessionsResult.data?.mySessions ?? []) as Array<Session & { id: string }>;
  const sessionGroups = sessionGroupsFromSessions(sessions);
  if (sessionsResult.data?.mySessions) {
    if (sessionGroups.length > 0) upsertMany("sessionGroups", sessionGroups);
    if (sessions.length > 0) upsertMany("sessions", sessions);
    reconcileEntitySnapshot(
      "sessionGroups",
      `home:${activeOrgId}`,
      sessionGroups.map((group) => group.id),
    );
    reconcileEntitySnapshot(
      "sessions",
      `home:${activeOrgId}`,
      sessions.map((session) => session.id),
    );
  }

  void getPlatform().storage.setItem(ME_REFRESH_KEY, String(Date.now()));

  const status = {
    channelsError:
      orgResult.error || groupsResult.error
        ? userFacingError(orgResult.error ?? groupsResult.error, "Couldn't refresh channels.")
        : null,
    homeError: sessionsResult.error
      ? userFacingError(sessionsResult.error, "Couldn't refresh your home feed.")
      : null,
  } satisfies Omit<RefreshOrgDataResult, "authorized">;

  setOrgStatus(activeOrgId, status);

  return {
    authorized: true,
    ...status,
  };
}

const inflightRefreshes = new Map<string, Promise<RefreshOrgDataResult>>();

/**
 * Fetch org data (channels, groups, sessions) and upsert successful slices
 * into the entity store. Query failures are reported per-screen so empty-state
 * rendering stays scoped to the fetch that actually powers that screen.
 */
export function refreshOrgData(activeOrgId: string): Promise<RefreshOrgDataResult> {
  const existing = inflightRefreshes.get(activeOrgId);
  if (existing) return existing;
  const promise = doRefreshOrgData(activeOrgId).finally(() => {
    inflightRefreshes.delete(activeOrgId);
  });
  inflightRefreshes.set(activeOrgId, promise);
  return promise;
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
  const previousOrgIdRef = useRef<string | null>(activeOrgId);
  useEffect(() => {
    if (previousOrgIdRef.current !== activeOrgId) {
      resetEntitySnapshots();
      useRefreshStatusStore.getState().reset();
    }
    previousOrgIdRef.current = activeOrgId;
    if (!activeOrgId) return;
    let cancelled = false;
    const client = getClient();

    void (async () => {
      const result = await refreshOrgData(activeOrgId);
      if (cancelled) return;
      if (!result.authorized) await handleUnauthorized();
    })();

    const subscription = client
      .subscription(ORG_EVENTS_SUBSCRIPTION, { organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: { orgEvents?: Event } }) => {
        if (isUnauthorized(result.error)) {
          void handleUnauthorized();
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
  }, [activeOrgId]);

  // Catch up list-level state (sessions, channels, unread counts) after a WS
  // reconnect: the server's in-memory pubsub has no replay, so events emitted
  // while the socket was down are lost to the live subscription.
  const reconnectCounter = useConnectionStore((s: ConnectionState) => s.reconnectCounter);
  const baselineReconnectCounter = useRef(reconnectCounter);
  useEffect(() => {
    if (!activeOrgId) return;
    if (reconnectCounter <= baselineReconnectCounter.current) return;
    baselineReconnectCounter.current = reconnectCounter;
    void (async () => {
      const result = await refreshOrgData(activeOrgId);
      if (!result.authorized) {
        await handleUnauthorized();
      }
    })().catch((err: unknown) => {
      console.warn("[hydrate] reconnect refresh failed", err);
    });
  }, [activeOrgId, reconnectCounter]);

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
