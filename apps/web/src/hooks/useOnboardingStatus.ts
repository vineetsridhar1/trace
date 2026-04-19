import { useCallback, useEffect } from "react";
import { useAuthStore, type AuthState } from "../stores/auth";
import { useEntityStore } from "../stores/entity";
import { useOnboardingStore } from "../stores/onboarding";

export interface OnboardingStatus {
  loading: boolean;
  anthropicSet: boolean;
  githubSet: boolean;
  hasRepo: boolean;
  hasChannel: boolean;
  allDone: boolean;
  completedCount: number;
  totalCount: number;
  refetch: () => void;
}

export function useOnboardingStatus(): OnboardingStatus {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const anthropicSet = useOnboardingStore((s) => s.anthropicSet);
  const githubSet = useOnboardingStore((s) => s.githubSet);
  const tokensLoaded = useOnboardingStore((s) => s.tokensLoaded);
  const tokensLoading = useOnboardingStore((s) => s.tokensLoading);
  const reposLoadedForOrg = useOnboardingStore((s) => s.reposLoadedForOrg);
  const fetchApiTokens = useOnboardingStore((s) => s.fetchApiTokens);
  const ensureReposLoaded = useOnboardingStore((s) => s.ensureReposLoaded);

  const repoCount = useEntityStore((s) => Object.keys(s.repos).length);
  const channelCount = useEntityStore((s) => Object.keys(s.channels).length);

  useEffect(() => {
    if (!tokensLoaded) void fetchApiTokens();
  }, [tokensLoaded, fetchApiTokens]);

  useEffect(() => {
    if (activeOrgId && reposLoadedForOrg !== activeOrgId) {
      void ensureReposLoaded(activeOrgId);
    }
  }, [activeOrgId, reposLoadedForOrg, ensureReposLoaded]);

  const hasRepo = repoCount > 0;
  const hasChannel = channelCount > 0;
  const completedCount = [anthropicSet, githubSet, hasRepo, hasChannel].filter(Boolean).length;
  const totalCount = 4;
  const allDone = completedCount === totalCount;

  const refetch = useCallback(() => {
    void fetchApiTokens();
    if (activeOrgId) void ensureReposLoaded(activeOrgId);
  }, [activeOrgId, fetchApiTokens, ensureReposLoaded]);

  return {
    loading: tokensLoading && !tokensLoaded,
    anthropicSet,
    githubSet,
    hasRepo,
    hasChannel,
    allDone,
    completedCount,
    totalCount,
    refetch,
  };
}
