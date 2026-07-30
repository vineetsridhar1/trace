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
import { GitBranch, Info, Terminal } from "lucide-react";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { SettingsStatusPill } from "./SettingsStatusPill";

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
        description="Codebases linked to this workspace. Each repository carries its own setup and run automation for coding sessions."
        action={
          <CreateRepoDialog
            triggerLabel="Connect repository"
            triggerVariant="default"
            onCreated={() => {
              setDesktopRefreshKey((k: number) => k + 1);
              useOnboardingStore.getState().invalidateRepos();
            }}
          />
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
        <>
          <div className="rounded-xl border border-dashed border-border bg-surface-deep px-6 py-10 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-[#0a0a0c] text-muted-foreground">
              <GitBranch size={18} />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-foreground">No repositories yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-muted-foreground">
              Connect the codebase your team works in. Agents and members start every coding session
              from a repository.
            </p>
            <div className="mt-5 flex justify-center">
              <CreateRepoDialog
                triggerLabel="Connect repository"
                triggerVariant="default"
                onCreated={() => {
                  setDesktopRefreshKey((key: number) => key + 1);
                  useOnboardingStore.getState().invalidateRepos();
                }}
              />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {[
              ["1", "Connect a repository", "Paste a GitHub URL, or add a local project."],
              [
                "2",
                "Set the default branch",
                "Sessions branch from it and open pull requests against it.",
              ],
              ["3", "Add automation", "Setup and run scripts make every session ready to work."],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-xl border border-border bg-surface-deep p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-[#0a0a0c] text-[11px] font-semibold text-muted-foreground">
                  {number}
                </span>
                <p className="mt-3 text-[13px] font-medium text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <Info size={13} className="mt-0.5 shrink-0" />
            Cloud sessions need a GitHub token or SSH key. Add yours under API keys, or share one
            with the workspace under Secrets.
          </p>
        </>
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
