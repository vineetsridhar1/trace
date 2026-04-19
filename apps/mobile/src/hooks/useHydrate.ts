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
import type { Channel, Event, Session } from "@trace/gql";
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

function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { response?: { status?: number }; message?: string };
  if (e.response?.status === 401) return true;
  return typeof e.message === "string" && /unauthor/i.test(e.message);
}

export function useHydrate(activeOrgId: string | null): void {
  const logout = useAuthStore((s: AuthState) => s.logout);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    const client = getClient();
    const upsertMany = useEntityStore.getState().upsertMany;

    async function handle401() {
      useEntityStore.getState().reset();
      await logout();
    }

    void (async () => {
      const orgResult = await client
        .query(ORGANIZATION_QUERY, { id: activeOrgId })
        .toPromise();
      if (cancelled) return;
      if (isUnauthorized(orgResult.error)) {
        await handle401();
        return;
      }
      const channels = (orgResult.data?.organization?.channels ?? []) as Array<
        Channel & { id: string }
      >;
      if (channels.length > 0) upsertMany("channels", channels);

      const sessionsResult = await client
        .query(MY_SESSIONS_QUERY, { organizationId: activeOrgId })
        .toPromise();
      if (cancelled) return;
      if (isUnauthorized(sessionsResult.error)) {
        await handle401();
        return;
      }
      const sessions = (sessionsResult.data?.mySessions ?? []) as Array<
        Session & { id: string }
      >;
      if (sessions.length > 0) upsertMany("sessions", sessions);

      void getPlatform().storage.setItem(ME_REFRESH_KEY, String(Date.now()));
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
        handleOrgEvent(result.data.orgEvents);
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
