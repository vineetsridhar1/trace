import { useEffect } from "react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useEntityStore } from "@trace/client-core";
import { useOnboardingStore } from "../stores/onboarding";

export interface OnboardingStatus {
  loading: boolean;
  hasRepo: boolean;
  hasChannel: boolean;
  hasSession: boolean;
  firstCodingChannelId: string | null;
  allDone: boolean;
  completedCount: number;
  totalCount: number;
}

export function useOnboardingStatus(): OnboardingStatus {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const reposLoadedForOrg = useOnboardingStore((s) => s.reposLoadedForOrg);
  const repoCount = useOnboardingStore((s) => s.repoCount);
  const sessionCount = useOnboardingStore((s) => s.sessionCount);
  const ensureReposLoaded = useOnboardingStore((s) => s.ensureReposLoaded);

  // Channels are populated by the org subscription (useOrgEvents) which is org-scoped,
  // so entity store channels reliably reflect the active org.
  const channelCount = useEntityStore((s) => Object.keys(s.channels).length);
  const firstCodingChannelId = useEntityStore((s) => {
    const channel = Object.values(s.channels).find((item) => item.type === "coding");
    return channel?.id ?? null;
  });
  const entitySessionCount = useEntityStore((s) => Object.keys(s.sessions).length);

  useEffect(() => {
    if (activeOrgId && reposLoadedForOrg !== activeOrgId) {
      void ensureReposLoaded(activeOrgId);
    }
  }, [activeOrgId, reposLoadedForOrg, ensureReposLoaded]);

  const hasRepo = repoCount > 0;
  const hasChannel = channelCount > 0;
  const hasSession = sessionCount > 0 || entitySessionCount > 0;
  const completedCount = [hasRepo, hasChannel, hasSession].filter(Boolean).length;
  const totalCount = 3;
  const allDone = completedCount === totalCount;

  return {
    loading: false,
    hasRepo,
    hasChannel,
    hasSession,
    firstCodingChannelId,
    allDone,
    completedCount,
    totalCount,
  };
}
