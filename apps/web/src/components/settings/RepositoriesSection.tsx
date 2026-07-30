import { useEffect, useCallback, useState } from "react";
import type { Repo } from "@trace/gql";
import { useAuthStore, type AuthState, type OrgMembership } from "@trace/client-core";
import { useEntityStore, useEntityIds } from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { useOnboardingStore } from "../../stores/onboarding";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { RepoCard } from "./RepoCard";
import { CreateRepoDialog } from "./CreateRepoDialog";
import { Terminal } from "lucide-react";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { SettingsStatusPill } from "./SettingsStatusPill";
import { RepositoriesEmptyState } from "./RepositoriesEmptyState";

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
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
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
  const workspaceName = memberships.find(
    (membership: OrgMembership) => membership.organizationId === activeOrgId,
  )?.organization.name;
  const handleCreated = () => {
    setDesktopRefreshKey((key) => key + 1);
    useOnboardingStore.getState().invalidateRepos();
  };
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
      <SettingsSectionHeader
        title="Repositories"
        description={`Codebases linked to ${workspaceName ?? "this workspace"}. Each repository carries its own automation: a setup script and named run scripts for sessions.`}
        action={
          sortedRepoIds.length ? (
            <CreateRepoDialog
              triggerLabel="Connect repository"
              triggerVariant="default"
              onCreated={handleCreated}
            />
          ) : undefined
        }
      />

      {isElectron && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-border bg-card/50 px-4 py-2.5">
          <Terminal size={14} className="shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {githubCliDetail ?? "Checking GitHub CLI support for local pull-request polling."}
          </p>
          <SettingsStatusPill
            tone={
              !githubCliStatus
                ? "muted"
                : githubCliStatus.installed && githubCliStatus.authenticated
                  ? "success"
                  : "warning"
            }
            label={githubCliLabel}
          />
          {githubCliStatus?.error && !githubCliStatus.authenticated && (
            <span className="sr-only">{githubCliStatus.error}</span>
          )}
        </div>
      )}

      {sortedRepoIds.length === 0 ? (
        <RepositoriesEmptyState onCreated={handleCreated} />
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
