import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { gql } from "@urql/core";
import {
  getPlatform,
  handleOrgEvent,
  useAuthStore,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import type { Channel, ChannelGroup, Event, Session } from "@trace/gql";
import { isUnauthorized } from "@/lib/auth";
import { timedEventIngest } from "@/lib/perf";
import { getClient } from "@/lib/urql";

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
  query MobileMySessions($organizationId: ID!) {
    mySessions(organizationId: $organizationId) {
      id
      name
      agentStatus
      sessionStatus
      tool
      model
      hosting
      createdBy { id name avatarUrl }
      repo { id name }
      sessionGroupId
      sessionGroup { id name slug status }
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
    client.query(MY_SESSIONS_QUERY, { organizationId: activeOrgId }).toPromise(),
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
  if (sessions.length > 0) upsertMany("sessions", sessions);

  void getPlatform().storage.setItem(ME_REFRESH_KEY, String(Date.now()));
  return true;
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

  // Re-fetch /auth/me on app foreground if it's been more than 24h.
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
