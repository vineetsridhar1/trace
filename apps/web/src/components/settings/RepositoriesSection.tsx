import { useEffect, useCallback, useState } from "react";
import type { Repo } from "@trace/gql";
import { useAuthStore } from "../../stores/auth";
import { useEntityStore, useEntityIds } from "../../stores/entity";
import type { EntityTableMap } from "../../stores/entity";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { RepoCard } from "./RepoCard";
import { CreateRepoDialog } from "./CreateRepoDialog";

const REPOS_QUERY = gql`
  query SettingsRepos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
      webhookActive
    }
  }
`;

export function RepositoriesSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertMany = useEntityStore((s: { upsertMany: ReturnType<typeof useEntityStore.getState>["upsertMany"] }) => s.upsertMany);
  const [desktopRefreshKey, setDesktopRefreshKey] = useState(0);

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

  const sortedRepoIds = useEntityIds(
    "repos",
    undefined,
    (a, b) =>
      ((a as EntityTableMap["repos"]).name ?? "").localeCompare(
        (b as EntityTableMap["repos"]).name ?? "",
      ),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Repositories</h2>
          <p className="text-sm text-muted-foreground">
            Codebases linked to your organization.
          </p>
        </div>
        <CreateRepoDialog onCreated={() => setDesktopRefreshKey((k: number) => k + 1)} />
      </div>

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
