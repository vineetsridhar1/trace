import { create } from "zustand";
import { gql } from "@urql/core";
import type { Repo } from "@trace/gql";
import { client } from "../lib/urql";
import { useAuthStore, useEntityStore } from "@trace/client-core";

const REPOS_QUERY = gql`
  query OnboardingRepos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
      webhookActive
    }
  }
`;

const SESSIONS_QUERY = gql`
  query OnboardingSessions($organizationId: ID!) {
    sessions(organizationId: $organizationId) {
      id
    }
  }
`;

export interface OnboardingState {
  reposLoadedForOrg: string | null;
  reposLoading: boolean;
  repoCount: number;
  sessionCount: number;
  ensureReposLoaded: (orgId: string) => Promise<void>;
  invalidateRepos: () => void;
  reset: () => void;
}

type Setter = (
  partial: Partial<OnboardingState> | ((s: OnboardingState) => Partial<OnboardingState>),
) => void;
type Getter = () => OnboardingState;

export const useOnboardingStore = create<OnboardingState>((set: Setter, get: Getter) => ({
  reposLoadedForOrg: null,
  reposLoading: false,
  repoCount: 0,
  sessionCount: 0,

  ensureReposLoaded: async (orgId: string) => {
    if (get().reposLoadedForOrg === orgId) return;
    set({ reposLoading: true });
    const [reposResult, sessionsResult] = await Promise.all([
      client
        .query(REPOS_QUERY, { organizationId: orgId }, { requestPolicy: "network-only" })
        .toPromise(),
      client
        .query(SESSIONS_QUERY, { organizationId: orgId }, { requestPolicy: "network-only" })
        .toPromise(),
    ]);
    if (reposResult.error || sessionsResult.error) {
      console.error("[onboarding] org setup query failed", reposResult.error ?? sessionsResult.error);
      set({ reposLoading: false });
      return;
    }
    const repos = (reposResult.data?.repos ?? []) as Array<Repo & { id: string }>;
    const sessions = (sessionsResult.data?.sessions ?? []) as Array<{ id: string }>;
    useEntityStore.getState().upsertMany("repos", repos);
    set({
      reposLoadedForOrg: orgId,
      reposLoading: false,
      repoCount: repos.length,
      sessionCount: sessions.length,
    });
  },

  invalidateRepos: () => set({ reposLoadedForOrg: null }),

  reset: () =>
    set({
      reposLoadedForOrg: null,
      reposLoading: false,
      repoCount: 0,
      sessionCount: 0,
    }),
}));

// Reset onboarding state when the user logs out or switches accounts.
let lastUserId: string | null = null;
useAuthStore.subscribe((state) => {
  const nextUserId = state.user?.id ?? null;
  if (lastUserId !== null && lastUserId !== nextUserId) {
    useOnboardingStore.getState().reset();
  }
  lastUserId = nextUserId;
});
