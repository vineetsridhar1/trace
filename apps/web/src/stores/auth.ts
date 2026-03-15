import { create } from "zustand";
import type { Organization, User } from "@trace/gql";
import { useEntityStore } from "./entity";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface AuthState {
  user: User | null;
  activeOrgId: string | null;
  loading: boolean;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveOrg: (orgId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeOrgId: null,
  loading: true,

  fetchMe: async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
      if (!res.ok) {
        set({ user: null, activeOrgId: null, loading: false });
        return;
      }
      const data = await res.json();
      const { organization, organizationId, ...userFields } = data.user;

      const user = userFields as User;
      set({ user, activeOrgId: organizationId, loading: false });

      // Hydrate entity store
      const { upsert } = useEntityStore.getState();
      upsert("users", user.id, user);
      if (organization) {
        upsert("organizations", organization.id, organization as Organization);
      }
    } catch {
      set({ user: null, activeOrgId: null, loading: false });
    }
  },

  logout: async () => {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    set({ user: null, activeOrgId: null });
  },

  setActiveOrg: (orgId) => set({ activeOrgId: orgId }),
}));
