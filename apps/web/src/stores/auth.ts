import { create } from "zustand";
import type { Organization, User, UserRole } from "@trace/gql";
import { useEntityStore } from "./entity";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "trace_token";
const ACTIVE_ORG_KEY = "trace_active_org";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  // Send active org header
  const activeOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
  if (activeOrgId) headers["X-Organization-Id"] = activeOrgId;

  return headers;
}

export interface OrgMembership {
  organizationId: string;
  role: UserRole;
  joinedAt: string;
  organization: { id: string; name: string };
}

interface AuthState {
  user: User | null;
  activeOrgId: string | null;
  orgMemberships: OrgMembership[];
  loading: boolean;
  setToken: (token: string) => void;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveOrg: (orgId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeOrgId: null,
  orgMemberships: [],
  loading: true,

  setToken: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
  },

  fetchMe: async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        set({ user: null, activeOrgId: null, orgMemberships: [], loading: false });
        return;
      }
      const data = await res.json();
      const { orgMemberships: memberships, ...userFields } = data.user;

      const user = userFields as User;
      const orgMemberships = (memberships ?? []) as OrgMembership[];

      // Determine active org: stored preference → first membership → null
      const storedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
      const validStoredOrg = orgMemberships.find((m: OrgMembership) => m.organizationId === storedOrgId);
      const activeOrgId = validStoredOrg
        ? storedOrgId
        : orgMemberships[0]?.organizationId ?? null;

      if (activeOrgId) {
        localStorage.setItem(ACTIVE_ORG_KEY, activeOrgId);
      }

      set({ user, activeOrgId, orgMemberships, loading: false });

      // Hydrate entity store
      const { upsert } = useEntityStore.getState();
      upsert("users", user.id, user);
      for (const membership of orgMemberships) {
        if (membership.organization) {
          upsert("organizations", membership.organization.id, membership.organization as Organization);
        }
      }
    } catch {
      set({ user: null, activeOrgId: null, orgMemberships: [], loading: false });
    }
  },

  logout: async () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVE_ORG_KEY);
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(),
    });
    set({ user: null, activeOrgId: null, orgMemberships: [] });
  },

  setActiveOrg: (orgId) => {
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    set({ activeOrgId: orgId });
  },
}));
