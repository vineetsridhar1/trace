import { useEffect, useCallback, useState } from "react";
import type { Repo } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { useEntityStore, useEntityIds } from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { useOnboardingStore } from "../../stores/onboarding";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { RepoCard } from "./RepoCard";
import { CreateRepoDialog } from "./CreateRepoDialog";

const REPOS_QUERY = gql`
  query SettingsRepos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      provider
      remoteUrl
      defaultBranch
      webhookActive
      applicationConfig {
        setupScripts {
          id
          name
          command
          workingDirectory
          env {
            key
            secretName
          }
        }
        applications {
          id
          name
          processes {
            id
            name
            command
            workingDirectory
            env {
              key
              secretName
            }
            required
            ports {
              id
              label
              port
              protocol
              defaultForwardingEnabled
              healthPath
            }
          }
        }
      }
    }
  }
`;

const isElectron = typeof window.trace?.getRepoConfig === "function";

export function RepositoriesSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertMany = useEntityStore(
    (s: { upsertMany: ReturnType<typeof useEntityStore.getState>["upsertMany"] }) => s.upsertMany,
  );
  const [desktopRefreshKey, setDesktopRefreshKey] = useState(0);
  const [githubCliStatus, setGithubCliStatus] = useState<DesktopGithubCliStatus | null>(null);

  const fetchRepos = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(REPOS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.repos) {
      upsertMany("repos", result.data.repos as Array<Repo & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  useEffect(() => {
    if (!isElectron) return;
    if (typeof window.trace?.getGithubCliStatus !== "function") {
      setGithubCliStatus({
        installed: false,
        authenticated: false,
        error: "Restart the desktop app to load GitHub CLI status checks.",
      });
      return;
    }
    window.trace
      .getGithubCliStatus()
      .then((status) => {
        setGithubCliStatus(status);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setGithubCliStatus({
          installed: false,
          authenticated: false,
          error: message,
        });
      });
  }, [desktopRefreshKey]);

  const sortedRepoIds = useEntityIds("repos", undefined, (a, b) =>
    ((a as EntityTableMap["repos"]).name ?? "").localeCompare(
      (b as EntityTableMap["repos"]).name ?? "",
    ),
  );
  const githubCliTone = !githubCliStatus
    ? "text-muted-foreground border-border/70 bg-surface-deep"
    : !githubCliStatus.installed || !githubCliStatus.authenticated
      ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
      : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  const githubCliLabel = !githubCliStatus
    ? "Checking GitHub CLI status..."
    : !githubCliStatus.installed
      ? "GitHub CLI not installed"
      : !githubCliStatus.authenticated
        ? "GitHub CLI not logged in"
        : "GitHub CLI connected";
  const githubCliDetail = !githubCliStatus
    ? null
    : !githubCliStatus.installed
      ? "Install gh to enable local PR status polling."
      : !githubCliStatus.authenticated
        ? "Run gh auth login on this computer to enable local PR status polling."
        : "Local sessions poll PR status through the desktop app using gh.";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Repositories</h2>
          <p className="text-sm text-muted-foreground">Codebases linked to your organization.</p>
        </div>
        <CreateRepoDialog
          onCreated={() => {
            setDesktopRefreshKey((k: number) => k + 1);
            useOnboardingStore.getState().invalidateRepos();
          }}
        />
      </div>

      {isElectron && (
        <div className={`mb-4 rounded-lg border px-4 py-3 ${githubCliTone}`}>
          <p className="text-sm font-medium">Local PR Polling</p>
          <p className="mt-1 text-sm">{githubCliLabel}</p>
          {githubCliDetail && <p className="mt-1 text-sm opacity-90">{githubCliDetail}</p>}
          {githubCliStatus?.error && !githubCliStatus.authenticated && (
            <p className="mt-2 break-words font-mono text-xs opacity-80">{githubCliStatus.error}</p>
          )}
        </div>
      )}

      {sortedRepoIds.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No repositories yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRepoIds.map((id) => (
            <RepoCard key={id} id={id} desktopRefreshKey={desktopRefreshKey} />
          ))}
        </div>
      )}
    </div>
  );
}
