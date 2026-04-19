import { create } from "zustand";
import { gql } from "@urql/core";
import type { ApiTokenProvider, Repo } from "@trace/gql";
import { client } from "../lib/urql";
import { useAuthStore, useEntityStore } from "@trace/client-core";

const API_TOKENS_QUERY = gql`
  query OnboardingApiTokens {
    myApiTokens {
      provider
      isSet
    }
  }
`;

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

interface TokenRow {
  provider: ApiTokenProvider;
  isSet: boolean;
}

export interface OnboardingState {
  anthropicSet: boolean;
  githubSet: boolean;
  tokensLoaded: boolean;
  tokensLoading: boolean;
  reposLoadedForOrg: string | null;
  reposLoading: boolean;
  repoCount: number;
  fetchApiTokens: () => Promise<void>;
  ensureReposLoaded: (orgId: string) => Promise<void>;
  invalidateRepos: () => void;
  reset: () => void;
}

type Setter = (
  partial: Partial<OnboardingState> | ((s: OnboardingState) => Partial<OnboardingState>),
) => void;
type Getter = () => OnboardingState;

export const useOnboardingStore = create<OnboardingState>((set: Setter, get: Getter) => ({
  anthropicSet: false,
  githubSet: false,
  tokensLoaded: false,
  tokensLoading: false,
  reposLoadedForOrg: null,
  reposLoading: false,
  repoCount: 0,

  fetchApiTokens: async () => {
    if (get().tokensLoading) return;
    set({ tokensLoading: true });
    const result = await client
      .query(API_TOKENS_QUERY, {}, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) {
      console.error("[onboarding] api token query failed", result.error);
      set({ tokensLoading: false });
      return;
    }
    const tokens = (result.data?.myApiTokens ?? []) as TokenRow[];
    const anthropic = tokens.find((t) => t.provider === "anthropic");
    const github = tokens.find((t) => t.provider === "github");
    set({
      anthropicSet: anthropic?.isSet === true,
      githubSet: github?.isSet === true,
      tokensLoading: false,
      tokensLoaded: true,
    });
  },

  ensureReposLoaded: async (orgId: string) => {
    if (get().reposLoadedForOrg === orgId) return;
    set({ reposLoading: true });
    const result = await client
      .query(REPOS_QUERY, { organizationId: orgId }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) {
      console.error("[onboarding] repos query failed", result.error);
      set({ reposLoading: false });
      return;
    }
    const repos = (result.data?.repos ?? []) as Array<Repo & { id: string }>;
    useEntityStore.getState().upsertMany("repos", repos);
    set({ reposLoadedForOrg: orgId, reposLoading: false, repoCount: repos.length });
  },

  invalidateRepos: () => set({ reposLoadedForOrg: null }),

  reset: () =>
    set({
      anthropicSet: false,
      githubSet: false,
      tokensLoaded: false,
      tokensLoading: false,
      reposLoadedForOrg: null,
      reposLoading: false,
      repoCount: 0,
    }),
}));

// Reset onboarding state when the user logs out or switches accounts,
// since API token status is per-user.
let lastUserId: string | null = null;
useAuthStore.subscribe((state) => {
  const nextUserId = state.user?.id ?? null;
  if (lastUserId !== null && lastUserId !== nextUserId) {
    useOnboardingStore.getState().reset();
  }
  lastUserId = nextUserId;
});
