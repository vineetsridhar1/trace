import { useCallback, useEffect, useMemo, useState } from "react";
import type { PullRequest } from "@trace/gql";
import { PULL_PULL_REQUEST_MUTATION, REPO_PULL_REQUESTS_QUERY } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { usePreferencesStore } from "../../stores/preferences";
import { navigateToSession } from "../../stores/ui";
import { getDefaultModel } from "../session/modelOptions";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function matchesPullRequest(pullRequest: PullRequest, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    `#${pullRequest.number}`,
    pullRequest.title,
    pullRequest.author,
    pullRequest.branch,
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function usePullPrDialog({ channelId, repoId }: { channelId: string; repoId?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);

  const filteredPullRequests = useMemo(
    () => pullRequests.filter((pullRequest) => matchesPullRequest(pullRequest, query)),
    [pullRequests, query],
  );

  const loadPullRequests = useCallback(async () => {
    if (!repoId) {
      setPullRequests([]);
      return;
    }

    setLoading(true);
    try {
      const result = await client.query(REPO_PULL_REQUESTS_QUERY, { repoId }).toPromise();
      if (result.error) {
        toast.error("Failed to load pull requests", { description: result.error.message });
        setPullRequests([]);
        return;
      }
      setPullRequests((result.data?.repoPullRequests ?? []) as PullRequest[]);
    } catch (error) {
      toast.error("Failed to load pull requests", { description: getErrorMessage(error) });
      setPullRequests([]);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    void loadPullRequests();
  }, [loadPullRequests, open]);

  const pullPullRequest = useCallback(
    async (pullRequest: PullRequest) => {
      if (!repoId || pendingBranch) return;

      const prefTool = usePreferencesStore.getState().defaultTool ?? "claude_code";
      const prefModel = usePreferencesStore.getState().defaultModel ?? getDefaultModel(prefTool);

      setPendingBranch(pullRequest.branch);
      try {
        const result = await client
          .mutation(PULL_PULL_REQUEST_MUTATION, {
            input: {
              repoId,
              branch: pullRequest.branch,
              channelId,
              tool: prefTool,
              model: prefModel ?? undefined,
            },
          })
          .toPromise();

        if (result.error) {
          toast.error("Failed to pull PR", { description: result.error.message });
          return;
        }

        const session = result.data?.pullPullRequest;
        if (!session?.id || !session.sessionGroupId) {
          toast.error("Failed to pull PR", { description: "Server did not return a session" });
          return;
        }

        setOpen(false);
        navigateToSession(session.channel?.id ?? channelId, session.sessionGroupId, session.id);
      } catch (error) {
        toast.error("Failed to pull PR", { description: getErrorMessage(error) });
      } finally {
        setPendingBranch(null);
      }
    },
    [channelId, pendingBranch, repoId],
  );

  return {
    open,
    setOpen,
    query,
    setQuery,
    filteredPullRequests,
    loading,
    pendingBranch,
    pullPullRequest,
  };
}
