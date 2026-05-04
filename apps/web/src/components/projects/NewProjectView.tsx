import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Send, UserRound } from "lucide-react";
import { gql } from "@urql/core";
import type { Project, Repo } from "@trace/gql";
import { useAuthStore, useEntityIds, useEntityStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { usePreferencesStore } from "../../stores/preferences";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { getDefaultModel } from "../session/modelOptions";

const REPOS_QUERY = gql`
  query NewProjectRepos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
      webhookActive
    }
  }
`;

const CREATE_PROJECT_FROM_GOAL_MUTATION = gql`
  mutation CreateProjectFromGoal($input: CreateProjectFromGoalInput!) {
    createProjectFromGoal(input: $input) {
      id
      name
      organizationId
      repoId
      runs {
        id
        projectId
        planningSessionId
      }
      createdAt
      updatedAt
    }
  }
`;

export function NewProjectView({ onCancel }: { onCancel: () => void }) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const user = useAuthStore((s) => s.user);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);
  const defaultTool = usePreferencesStore((s) => s.defaultTool);
  const defaultModel = usePreferencesStore((s) => s.defaultModel);
  const [goal, setGoal] = useState("");
  const [repoId, setRepoId] = useState("__none__");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);

  const repoIds = useEntityIds(
    "repos",
    () => true,
    (a, b) => a.name.localeCompare(b.name),
  );
  const reposById = useEntityStore((s) => s.repos);
  const selectedRepo = repoId === "__none__" ? null : reposById[repoId];
  const canSubmit = goal.trim().length > 0 && !submitting && Boolean(activeOrgId);
  const projectName = useMemo(() => deriveProjectName(goal), [goal]);

  const fetchRepos = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingRepos(true);
    setRepoError(null);
    const result = await client.query(REPOS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.error) {
      setRepoError(result.error.message);
      setLoadingRepos(false);
      return;
    }
    if (result.data?.repos) {
      const repos = (result.data.repos as Array<Omit<Repo, "projects" | "sessions">>).map(
        (repo) =>
          ({
            ...repo,
            projects: [],
            sessions: [],
          }) satisfies Repo,
      );
      upsertMany("repos", repos);
    }
    setLoadingRepos(false);
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const handleSubmit = async () => {
    if (!activeOrgId) return;
    const initialGoal = goal.trim();
    if (!initialGoal) {
      setError("Initial goal is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await client
      .mutation(CREATE_PROJECT_FROM_GOAL_MUTATION, {
        input: {
          organizationId: activeOrgId,
          goal: initialGoal,
          name: projectName,
          repoId: repoId === "__none__" ? null : repoId,
          planningTool: defaultTool ?? "claude_code",
          planningModel: defaultModel ?? getDefaultModel(defaultTool ?? "claude_code"),
          executionConfig: {},
        },
      })
      .toPromise();

    const project = result.data?.createProjectFromGoal as Pick<Project, "id"> | undefined;
    if (result.error || !project) {
      setError(result.error?.message ?? "Project could not be created.");
      setSubmitting(false);
      return;
    }

    setActiveProjectId(project.id);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onCancel}>
          <ArrowLeft size={16} />
          Projects
        </Button>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">New project</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe the project goal and Trace will open the planning workspace.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="project-goal" className="text-sm font-medium text-foreground">
            Goal
          </label>
          <Textarea
            id="project-goal"
            autoFocus
            value={goal}
            onChange={(event) => {
              setGoal(event.currentTarget.value);
              if (error) setError(null);
            }}
            placeholder="Build a billing dashboard that shows MRR, churn, plan mix, and account-level drilldowns."
            className="min-h-44 resize-y text-base leading-6"
            aria-invalid={error === "Initial goal is required."}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Repository</label>
            <Select value={repoId} onValueChange={(value) => setRepoId(value ?? "__none__")}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue>
                  {selectedRepo ? selectedRepo.name : loadingRepos ? "Loading..." : "No repo"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No repo</SelectItem>
                {repoIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {reposById[id]?.name ?? id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {repoError && <p className="text-xs text-destructive">{repoError}</p>}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Members</div>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-input px-2.5 text-sm text-foreground">
              <UserRound size={16} className="text-muted-foreground" />
              <span className="min-w-0 truncate">{user?.name || user?.email || "You"}</span>
              <span className="ml-auto rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
                Admin
              </span>
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Start planning
          </Button>
        </div>
      </div>
    </div>
  );
}

function deriveProjectName(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, " ");
  if (!normalized) return "Untitled project";
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
}
