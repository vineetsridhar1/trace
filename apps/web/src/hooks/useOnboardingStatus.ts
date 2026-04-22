import { useEffect } from "react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useEntityStore } from "@trace/client-core";
import { useOnboardingStore } from "../stores/onboarding";
import { isLocalMode } from "../lib/runtime-mode";

export interface OnboardingStatus {
  loading: boolean;
  anthropicSet: boolean;
  githubSet: boolean;
  hasRepo: boolean;
  hasChannel: boolean;
  allDone: boolean;
  completedCount: number;
  totalCount: number;
}

export function useOnboardingStatus(): OnboardingStatus {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const anthropicSet = useOnboardingStore((s) => s.anthropicSet);
  const githubSet = useOnboardingStore((s) => s.githubSet);
  const tokensLoaded = useOnboardingStore((s) => s.tokensLoaded);
  const tokensLoading = useOnboardingStore((s) => s.tokensLoading);
  const reposLoadedForOrg = useOnboardingStore((s) => s.reposLoadedForOrg);
  const repoCount = useOnboardingStore((s) => s.repoCount);
  const fetchApiTokens = useOnboardingStore((s) => s.fetchApiTokens);
  const ensureReposLoaded = useOnboardingStore((s) => s.ensureReposLoaded);

  // Channels are populated by the org subscription (useOrgEvents) which is org-scoped,
  // so entity store channels reliably reflect the active org.
  const channelCount = useEntityStore((s) => Object.keys(s.channels).length);

  useEffect(() => {
    if (isLocalMode) return;
    if (!tokensLoaded) void fetchApiTokens();
  }, [tokensLoaded, fetchApiTokens]);

  useEffect(() => {
    if (activeOrgId && reposLoadedForOrg !== activeOrgId) {
      void ensureReposLoaded(activeOrgId);
    }
  }, [activeOrgId, reposLoadedForOrg, ensureReposLoaded]);

  const hasRepo = repoCount > 0;
  const hasChannel = channelCount > 0;
  const effectiveAnthropicSet = isLocalMode ? true : anthropicSet;
  const effectiveGithubSet = isLocalMode ? true : githubSet;
  const completedCount = isLocalMode
    ? [hasRepo, hasChannel].filter(Boolean).length
    : [effectiveAnthropicSet, effectiveGithubSet, hasRepo, hasChannel].filter(Boolean).length;
  const totalCount = isLocalMode ? 2 : 4;
  const allDone = completedCount === totalCount;

  return {
    loading: isLocalMode ? false : tokensLoading && !tokensLoaded,
    anthropicSet: effectiveAnthropicSet,
    githubSet: effectiveGithubSet,
    hasRepo,
    hasChannel,
    allDone,
    completedCount,
    totalCount,
  };
}
