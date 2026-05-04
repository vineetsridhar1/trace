import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2, Send } from "lucide-react";
import { gql } from "@urql/core";
import type { Project, Repo } from "@trace/gql";
import { useAuthStore, useEntityIds, useEntityStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { usePreferencesStore } from "../../stores/preferences";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { getDefaultModel, getModelLabel, getModelsForTool } from "../session/modelOptions";
import { RuntimeSelector, type RuntimeInfo } from "../session/RuntimeSelector";

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
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);
  const defaultTool = usePreferencesStore((s) => s.defaultTool);
  const defaultModel = usePreferencesStore((s) => s.defaultModel);
  const planningTool = defaultTool ?? "claude_code";
  const [goal, setGoal] = useState("");
  const [repoId, setRepoId] = useState("__none__");
  const [planningModel, setPlanningModel] = useState(
    () => defaultModel ?? getDefaultModel(planningTool) ?? "",
  );
  const [runtimeInstanceId, setRuntimeInstanceId] = useState<string | undefined>(undefined);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
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
  const modelOptions = useMemo(() => getModelsForTool(planningTool), [planningTool]);

  useEffect(() => {
    const preferred = defaultModel ?? getDefaultModel(planningTool) ?? modelOptions[0]?.value ?? "";
    if (!planningModel || !modelOptions.some((option) => option.value === planningModel)) {
      setPlanningModel(preferred);
    }
  }, [defaultModel, modelOptions, planningModel, planningTool]);

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
          planningTool,
          planningModel: planningModel || null,
          planningHosting: runtimeInfo?.hostingMode ?? null,
          planningRuntimeInstanceId: runtimeInstanceId ?? null,
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

      <div className="grid min-h-[calc(100vh-57px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-h-0 border-r border-border bg-background px-6 py-5">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-muted-foreground" />
            <h1 className="text-sm font-semibold text-foreground">Readonly plan</h1>
          </div>
          <div className="mt-5 rounded-md border border-border bg-surface-deep">
            <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              {projectName}
            </div>
            <div className="min-h-[520px] px-5 py-4 font-mono text-sm leading-7 text-foreground">
              {goal.trim() ? (
                <>
                  <div className="text-muted-foreground"># Project goal</div>
                  <div className="mt-3 whitespace-pre-wrap">{goal.trim()}</div>
                  <div className="mt-8 text-muted-foreground"># Planning mode</div>
                  <div className="mt-3">Mode: plan</div>
                </>
              ) : (
                <div className="text-muted-foreground"># Project goal</div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col bg-surface px-5 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">New Chat</h2>
            <p className="mt-1 text-sm text-muted-foreground">Plan mode</p>
          </div>

          <div className="mt-4 space-y-2">
            <label htmlFor="project-goal" className="text-sm font-medium text-foreground">
              Prompt
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
              className="min-h-52 resize-none rounded-xl text-base leading-6"
              aria-invalid={error === "Initial goal is required."}
            />
          </div>

          <div className="mt-4 space-y-4">
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
              <label className="text-sm font-medium text-foreground">Bridge</label>
              <RuntimeSelector
                tool={planningTool}
                open
                value={runtimeInstanceId}
                channelRepoId={selectedRepo?.id}
                onChange={(runtimeId, info) => {
                  setRuntimeInstanceId(runtimeId);
                  setRuntimeInfo(info);
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Model</label>
              <Select
                value={planningModel}
                onValueChange={(value) => setPlanningModel(value ?? "")}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue>
                    {planningModel ? getModelLabel(planningModel) : "Select model"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="mt-auto flex justify-end gap-2 pt-5">
            <Button variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Start planning
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function deriveProjectName(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, " ");
  if (!normalized) return "Untitled project";
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
}
