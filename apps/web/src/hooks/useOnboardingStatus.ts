import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import type { ApiTokenProvider } from "@trace/gql";
import { client } from "../lib/urql";
import { useAuthStore, type AuthState } from "../stores/auth";
import { useUIStore, type UIState } from "../stores/ui";

const ONBOARDING_STATUS_QUERY = gql`
  query OnboardingStatus($organizationId: ID!) {
    myApiTokens {
      provider
      isSet
    }
    repos(organizationId: $organizationId) {
      id
    }
  }
`;

interface TokenRow {
  provider: ApiTokenProvider;
  isSet: boolean;
}

interface RepoRow {
  id: string;
}

interface OnboardingStatusData {
  myApiTokens: TokenRow[];
  repos: RepoRow[];
}

export interface OnboardingStatus {
  loading: boolean;
  anthropicSet: boolean;
  githubSet: boolean;
  hasRepo: boolean;
  allDone: boolean;
  completedCount: number;
  totalCount: number;
  refetch: () => void;
}

export function useOnboardingStatus(): OnboardingStatus {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const refreshTick = useUIStore((s: UIState) => s.refreshTick);
  const [loading, setLoading] = useState(true);
  const [anthropicSet, setAnthropicSet] = useState(false);
  const [githubSet, setGithubSet] = useState(false);
  const [hasRepo, setHasRepo] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await client
      .query(ONBOARDING_STATUS_QUERY, { organizationId: activeOrgId }, { requestPolicy: "network-only" })
      .toPromise();
    const data = result.data as OnboardingStatusData | undefined;
    if (data) {
      const anthropic = data.myApiTokens.find((t) => t.provider === "anthropic");
      const github = data.myApiTokens.find((t) => t.provider === "github");
      setAnthropicSet(anthropic?.isSet === true);
      setGithubSet(github?.isSet === true);
      setHasRepo(data.repos.length > 0);
    }
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus, refreshTick]);

  const completedCount = [anthropicSet, githubSet, hasRepo].filter(Boolean).length;
  const totalCount = 3;
  const allDone = completedCount === totalCount;

  return {
    loading,
    anthropicSet,
    githubSet,
    hasRepo,
    allDone,
    completedCount,
    totalCount,
    refetch: () => {
      void fetchStatus();
    },
  };
}
