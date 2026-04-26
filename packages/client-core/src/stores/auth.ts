import { create } from "zustand";
import type { Organization, User, UserRole } from "@trace/gql";
import { getPlatform } from "../platform.js";
import { useEntityStore } from "./entity.js";

const ACTIVE_ORG_KEY = "trace_active_org";
export const LOCAL_LOGIN_NAME_KEY = "trace_local_login_name";

export interface OrgMembership {
  organizationId: string;
  role: UserRole;
  joinedAt: string;
  organization: { id: string; name: string };
}

export interface AuthState {
  user: User | null;
  activeOrgId: string | null;
  orgMemberships: OrgMembership[];
  loading: boolean;
  /** In-memory cache of the auth token for synchronous header construction. */
  token: string | null;
  signInWithToken: (token: string) => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveOrg: (orgId: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

function shouldUseBearerAuth(): boolean {
  return getPlatform().authMode === "bearer";
}

async function readActiveOrgId(): Promise<string | null> {
  const value = await getPlatform().storage.getItem(ACTIVE_ORG_KEY);
  return value ?? null;
}

export const useAuthStore = create<AuthState>((set: SetState<AuthState>) => ({
  user: null,
  activeOrgId: null,
  orgMemberships: [],
  loading: true,
  token: null,

  signInWithToken: async (token: string) => {
    if (shouldUseBearerAuth()) {
      await getPlatform().secureStorage.setToken(token);
      set({ token });
    } else {
      set({ token: null });
    }
    await useAuthStore.getState().fetchMe();
  },

  fetchMe: async () => {
    const platform = getPlatform();
    try {
      let token: string | null = null;
      if (platform.authMode === "bearer") {
        // Hydrate the in-memory token from secure storage on first call so
        // synchronous consumers (getAuthHeaders, WS connection params) see it.
        token = useAuthStore.getState().token;
        if (!token) {
          token = await platform.secureStorage.getToken();
          if (token) set({ token });
        }
      }

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const storedOrgId = await readActiveOrgId();
      if (storedOrgId) headers["X-Organization-Id"] = storedOrgId;

      const res = await platform.fetch(`${platform.apiUrl}/auth/me`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        set({ user: null, activeOrgId: null, orgMemberships: [], loading: false });
        return;
      }
      const data = (await res.json()) as { user: Record<string, unknown> };
      const { orgMemberships: memberships, ...userFields } = data.user;

      const user = userFields as User;
      const orgMemberships = (memberships ?? []) as OrgMembership[];

      // Determine active org: stored preference → first membership → null
      const validStoredOrg = orgMemberships.find(
        (m: OrgMembership) => m.organizationId === storedOrgId,
      );
      const activeOrgId = validStoredOrg
        ? storedOrgId
        : (orgMemberships[0]?.organizationId ?? null);

      if (activeOrgId) {
        await platform.storage.setItem(ACTIVE_ORG_KEY, activeOrgId);
      }

      set({ user, activeOrgId, orgMemberships, loading: false });

      // Hydrate entity store
      const { upsert } = useEntityStore.getState();
      upsert("users", user.id, user);
      for (const membership of orgMemberships) {
        if (membership.organization) {
          upsert(
            "organizations",
            membership.organization.id,
            membership.organization as Organization,
          );
        }
      }
    } catch {
      set({ user: null, activeOrgId: null, orgMemberships: [], loading: false });
    }
  },

  logout: async () => {
    const platform = getPlatform();
    const headers: Record<string, string> = {};
    if (platform.authMode === "bearer") {
      const token = useAuthStore.getState().token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    try {
      await platform.secureStorage.clearToken();
      await platform.storage.removeItem(ACTIVE_ORG_KEY);
      await platform.storage.removeItem(LOCAL_LOGIN_NAME_KEY);
      // Time-box the server call: clearing local state doesn't require a
      // successful response, and without a cap a slow/offline network would
      // leave the UI stuck on "Sign out" for the fetch default (30s+).
      await platform.fetch(`${platform.apiUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers,
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.warn("[auth] logout failed", err);
    } finally {
      useEntityStore.getState().reset();
      set({
        user: null,
        activeOrgId: null,
        orgMemberships: [],
        token: null,
        loading: false,
      });
    }
  },

  setActiveOrg: (orgId: string) => {
    set({ activeOrgId: orgId });
    Promise.resolve(getPlatform().storage.setItem(ACTIVE_ORG_KEY, orgId)).catch((err: unknown) => {
      console.error("[auth] failed to persist active org", err);
    });
  },
}));

/**
 * Synchronous accessor for HTTP headers used by all authenticated requests.
 * Reads the in-memory token cache populated by `fetchMe` / `signInWithToken`.
 */
export function getAuthHeaders(): Record<string, string> {
  const { token, activeOrgId } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (shouldUseBearerAuth() && token) headers.Authorization = `Bearer ${token}`;
  if (activeOrgId) headers["X-Organization-Id"] = activeOrgId;
  return headers;
}
