import { create } from "zustand";
import type { Organization, User, UserRole } from "@trace/gql";
import { getPlatform } from "../platform.js";
import { useEntityStore } from "./entity.js";

const ACTIVE_ORG_KEY = "trace_active_org";
const RETURNING_USER_KEY = "trace_returning_user";
export const LOCAL_LOGIN_NAME_KEY = "trace_local_login_name";

export interface OrgMembership {
  organizationId: string;
  role: UserRole;
  joinedAt: string;
  organization: { id: string; name: string };
}

export interface ReturningUser {
  name: string;
  avatarUrl: string | null;
  organizationName: string | null;
}

export interface LogoutOptions {
  pushToken?: string | null;
}

export interface AuthState {
  user: User | null;
  /** Minimal identity hint used for the cold-start "Welcome back" reconnect screen. */
  returningUser: ReturningUser | null;
  activeOrgId: string | null;
  orgMemberships: OrgMembership[];
  loading: boolean;
  /** The identity check could not reach Trace; this is not an authentication failure. */
  authUnavailable: boolean;
  /** Keeps the authenticated UI mounted while an expired browser session is reconnected. */
  reauthRequired: boolean;
  /** In-memory cache of the auth token for synchronous header construction. */
  token: string | null;
  signInWithToken: (token: string) => Promise<void>;
  fetchMe: () => Promise<boolean>;
  requireReauthentication: () => void;
  forgetReturningUser: () => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<void>;
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

async function readReturningUser(): Promise<ReturningUser | null> {
  let value: string | null;
  try {
    value = await getPlatform().storage.getItem(RETURNING_USER_KEY);
  } catch {
    return null;
  }
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ReturningUser>;
    if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;
    if (
      parsed.avatarUrl !== undefined &&
      parsed.avatarUrl !== null &&
      typeof parsed.avatarUrl !== "string"
    ) {
      return null;
    }
    if (
      parsed.organizationName !== undefined &&
      parsed.organizationName !== null &&
      typeof parsed.organizationName !== "string"
    ) {
      return null;
    }
    return {
      name: parsed.name.trim(),
      avatarUrl: parsed.avatarUrl ?? null,
      organizationName: parsed.organizationName?.trim() || null,
    };
  } catch {
    return null;
  }
}

async function rememberReturningUser(
  user: User,
  orgMemberships: OrgMembership[],
  activeOrgId: string | null,
): Promise<ReturningUser> {
  const activeMembership =
    orgMemberships.find((membership) => membership.organizationId === activeOrgId) ??
    orgMemberships[0];
  const returningUser: ReturningUser = {
    name: user.name.trim() || user.email,
    avatarUrl: user.avatarUrl ?? null,
    organizationName: activeMembership?.organization.name ?? null,
  };
  try {
    await getPlatform().storage.setItem(RETURNING_USER_KEY, JSON.stringify(returningUser));
  } catch (error) {
    console.warn("[auth] failed to persist returning user", error);
  }
  return returningUser;
}

export const useAuthStore = create<AuthState>((set: SetState<AuthState>) => ({
  user: null,
  returningUser: null,
  activeOrgId: null,
  orgMemberships: [],
  loading: true,
  authUnavailable: false,
  reauthRequired: false,
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
      let returningUser = useAuthStore.getState().returningUser;
      if (!useAuthStore.getState().user && !returningUser) {
        returningUser = await readReturningUser();
        if (returningUser) set({ returningUser });
      }

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
        const hasAuthenticatedUser = useAuthStore.getState().user !== null;
        if (res.status === 401 && platform.authMode === "cookie" && hasAuthenticatedUser) {
          set({ authUnavailable: false, reauthRequired: true, loading: false });
        } else if (res.status === 401) {
          set({
            user: null,
            returningUser,
            activeOrgId: null,
            orgMemberships: [],
            authUnavailable: false,
            reauthRequired: false,
            loading: false,
          });
        } else {
          set({ authUnavailable: true, loading: false });
        }
        return false;
      }
      const data = (await res.json()) as { user: Record<string, unknown> };
      const { orgMemberships: memberships, ...userFields } = data.user;

      const user = userFields as User;
      const orgMemberships = (memberships ?? []) as OrgMembership[];
      const previousUserId = useAuthStore.getState().user?.id;
      if (previousUserId && previousUserId !== user.id) {
        useEntityStore.getState().reset();
      }

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

      returningUser = await rememberReturningUser(user, orgMemberships, activeOrgId);
      set({
        user,
        returningUser,
        activeOrgId,
        orgMemberships,
        authUnavailable: false,
        reauthRequired: false,
        loading: false,
      });

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
      return true;
    } catch {
      if (useAuthStore.getState().user) {
        set({ authUnavailable: true, loading: false });
      } else {
        set({
          user: null,
          returningUser: useAuthStore.getState().returningUser,
          activeOrgId: null,
          orgMemberships: [],
          authUnavailable: true,
          reauthRequired: false,
          loading: false,
        });
      }
      return false;
    }
  },

  requireReauthentication: () => {
    const { user } = useAuthStore.getState();
    if (shouldUseBearerAuth() || !user) return;
    set({ authUnavailable: false, reauthRequired: true, loading: false });
  },

  forgetReturningUser: async () => {
    try {
      await getPlatform().storage.removeItem(RETURNING_USER_KEY);
    } catch (error) {
      console.warn("[auth] failed to forget returning user", error);
    } finally {
      set({ returningUser: null });
    }
  },

  logout: async (options?: LogoutOptions) => {
    const platform = getPlatform();
    const headers: Record<string, string> = {};
    if (platform.authMode === "bearer") {
      const token = useAuthStore.getState().token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const body = options?.pushToken ? JSON.stringify({ pushToken: options.pushToken }) : undefined;
    if (body) headers["Content-Type"] = "application/json";
    try {
      await platform.secureStorage.clearToken();
      await platform.storage.removeItem(ACTIVE_ORG_KEY);
      await platform.storage.removeItem(LOCAL_LOGIN_NAME_KEY);
      await platform.storage.removeItem(RETURNING_USER_KEY);
      // Time-box the server call: clearing local state doesn't require a
      // successful response, and without a cap a slow/offline network would
      // leave the UI stuck on "Sign out" for the fetch default (30s+).
      await platform.fetch(`${platform.apiUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.warn("[auth] logout failed", err);
    } finally {
      useEntityStore.getState().reset();
      set({
        user: null,
        returningUser: null,
        activeOrgId: null,
        orgMemberships: [],
        authUnavailable: false,
        reauthRequired: false,
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

/** Detect the HTTP, GraphQL, and WebSocket forms of an expired auth session. */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    response?: { status?: number };
    networkError?: { statusCode?: number; message?: string };
    graphQLErrors?: Array<{ extensions?: { code?: string } }>;
    code?: number;
    message?: string;
  };
  if (candidate.response?.status === 401 || candidate.networkError?.statusCode === 401) {
    return true;
  }
  if (
    typeof candidate.networkError?.message === "string" &&
    /\b401\b/.test(candidate.networkError.message)
  ) {
    return true;
  }
  if (
    candidate.graphQLErrors?.some(
      (graphQLError) =>
        graphQLError.extensions?.code === "UNAUTHENTICATED" ||
        graphQLError.extensions?.code === "UNAUTHORIZED",
    )
  ) {
    return true;
  }
  if (candidate.code === 4401 || candidate.code === 4403) return true;
  return (
    typeof candidate.message === "string" &&
    /\b401\b|unauthenticated|unauthorized/i.test(candidate.message)
  );
}
