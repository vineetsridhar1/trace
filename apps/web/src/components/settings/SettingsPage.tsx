import { useEffect, useCallback } from "react";
import type { Repo } from "@trace/gql";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { useEntityStore, useEntityIds } from "../../stores/entity";
import type { EntityTableMap } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { RepoCard } from "./RepoCard";
import { CreateRepoDialog } from "./CreateRepoDialog";
import { ApiTokensSection } from "./ApiTokensSection";
import { SessionDefaultsSection } from "./SessionDefaultsSection";

const REPOS_QUERY = gql`
  query Repos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
    }
  }
`;

export function SettingsPage() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setActivePage = useUIStore((s) => s.setActivePage);

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
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setActivePage("main")}
        >
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <section className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Repositories</h2>
              <p className="text-sm text-muted-foreground">
                Codebases linked to your organization.
              </p>
            </div>
            <CreateRepoDialog />
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
                <RepoCard key={id} id={id} />
              ))}
            </div>
          )}
        </section>

        <SessionDefaultsSection />

        <ApiTokensSection />
      </div>
    </div>
  );
}
