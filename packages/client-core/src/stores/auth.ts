import { create } from "zustand";
import type { Organization, User, UserRole } from "@trace/gql";
import { getPlatform } from "../platform.js";
import { useEntityStore } from "./entity.js";

const ACTIVE_ORG_KEY = "trace_active_org";

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
    await getPlatform().secureStorage.setToken(token);
    set({ token });
    await useAuthStore.getState().fetchMe();
  },

  fetchMe: async () => {
    const platform = getPlatform();
    try {
      // Hydrate the in-memory token from secure storage on first call so
      // synchronous consumers (getAuthHeaders, WS connection params) see it.
      let token = useAuthStore.getState().token;
      if (!token) {
        token = await platform.secureStorage.getToken();
        if (token) set({ token });
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
      const data = (await res.json()) as { user: Record<string, unknown>; token?: string };
      const { orgMemberships: memberships, ...userFields } = data.user;

      // Ensure the session token is persisted — it may be missing when the
      // user authenticated via httpOnly cookie (OAuth popup with severed
      // window.opener in Electron).
      if (data.token && !token) {
        await platform.secureStorage.setToken(data.token);
        set({ token: data.token });
      }

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
    const token = useAuthStore.getState().token;
    await platform.secureStorage.clearToken();
    await platform.storage.removeItem(ACTIVE_ORG_KEY);

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    await platform.fetch(`${platform.apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers,
    });
    set({ user: null, activeOrgId: null, orgMemberships: [], token: null });
  },

  setActiveOrg: (orgId: string) => {
    void getPlatform().storage.setItem(ACTIVE_ORG_KEY, orgId);
    set({ activeOrgId: orgId });
  },
}));

/**
 * Synchronous accessor for HTTP headers used by all authenticated requests.
 * Reads the in-memory token cache populated by `fetchMe` / `signInWithToken`.
 */
export function getAuthHeaders(): Record<string, string> {
  const { token, activeOrgId } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeOrgId) headers["X-Organization-Id"] = activeOrgId;
  return headers;
}
