import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import {
  CircleDot,
  GitPullRequest,
  AlertCircle,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  ExternalLink,
  Tag,
} from "lucide-react";
import { client } from "../../lib/urql";
import { useEntityField } from "../../stores/entity";
import { cn } from "../../lib/utils";

const GITHUB_REPO_INFO_QUERY = gql`
  query GitHubRepoInfo($repoId: ID!, $branch: String) {
    githubRepoInfo(repoId: $repoId, branch: $branch) {
      pullRequests {
        number
        title
        state
        url
        author
        branch
        baseBranch
        draft
        additions
        deletions
        createdAt
        updatedAt
      }
      issues {
        number
        title
        state
        url
        author
        labels
        createdAt
        updatedAt
      }
      workflowRuns {
        id
        name
        status
        conclusion
        url
        branch
        event
        createdAt
        updatedAt
      }
    }
  }
`;

interface PullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  branch: string;
  baseBranch: string;
  draft: boolean;
  additions: number;
  deletions: number;
  createdAt: string;
  updatedAt: string;
}

interface Issue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRun {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
}

interface GitHubRepoInfo {
  pullRequests: PullRequest[];
  issues: Issue[];
  workflowRuns: WorkflowRun[];
}

type Section = "prs" | "issues" | "actions";

interface GitHubPanelProps {
  sessionGroupId: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RunStatusIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === "completed") {
    if (conclusion === "success") return <CheckCircle2 size={12} className="text-green-400" />;
    if (conclusion === "failure") return <XCircle size={12} className="text-red-400" />;
    if (conclusion === "cancelled") return <XCircle size={12} className="text-muted-foreground" />;
    return <CheckCircle2 size={12} className="text-yellow-400" />;
  }
  if (status === "in_progress") return <Play size={12} className="text-yellow-400" />;
  if (status === "queued" || status === "waiting") return <Clock size={12} className="text-muted-foreground" />;
  return <Clock size={12} className="text-muted-foreground" />;
}

export function GitHubPanel({ sessionGroupId }: GitHubPanelProps) {
  const repo = useEntityField("sessionGroups", sessionGroupId, "repo") as
    | { id: string; name: string }
    | null
    | undefined;
  const branch = useEntityField("sessionGroups", sessionGroupId, "branch") as
    | string
    | null
    | undefined;

  const [data, setData] = useState<GitHubRepoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<Section, boolean>>({
    prs: true,
    issues: true,
    actions: true,
  });

  const toggleSection = useCallback((section: Section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const fetchData = useCallback(async () => {
    if (!repo?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client
        .query(GITHUB_REPO_INFO_QUERY, { repoId: repo.id, branch: branch ?? undefined })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
      } else {
        setData(result.data?.githubRepoInfo ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GitHub data");
    } finally {
      setLoading(false);
    }
  }, [repo?.id, branch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-xs text-muted-foreground">No repository linked</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-red-400">Failed to load GitHub data</p>
        <p className="text-[11px] text-muted-foreground">{error}</p>
        <button
          onClick={fetchData}
          className="mt-1 text-[11px] text-blue-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="truncate text-[11px] text-muted-foreground">{repo.name}</span>
        <button
          type="button"
          onClick={fetchData}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* Pull Requests */}
        <SectionHeader
          icon={<GitPullRequest size={12} />}
          label="Pull Requests"
          count={data.pullRequests.length}
          expanded={expandedSections.prs}
          onToggle={() => toggleSection("prs")}
        />
        {expandedSections.prs && (
          <div>
            {data.pullRequests.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">No open pull requests</p>
            ) : (
              data.pullRequests.map((pr) => (
                <a
                  key={pr.number}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover group"
                >
                  <GitPullRequest
                    size={12}
                    className={cn("mt-0.5 shrink-0", pr.draft ? "text-muted-foreground" : "text-green-400")}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[11px] text-foreground">
                        {pr.title}
                      </span>
                      <ExternalLink size={10} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>#{pr.number}</span>
                      <span>{pr.author}</span>
                      <span>{pr.branch}</span>
                      {(pr.additions > 0 || pr.deletions > 0) && (
                        <span className="font-mono">
                          {pr.additions > 0 && <span className="text-green-400">+{pr.additions}</span>}
                          {pr.additions > 0 && pr.deletions > 0 && " "}
                          {pr.deletions > 0 && <span className="text-red-400">-{pr.deletions}</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {/* Issues */}
        <SectionHeader
          icon={<CircleDot size={12} />}
          label="Issues"
          count={data.issues.length}
          expanded={expandedSections.issues}
          onToggle={() => toggleSection("issues")}
        />
        {expandedSections.issues && (
          <div>
            {data.issues.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">No open issues</p>
            ) : (
              data.issues.map((issue) => (
                <a
                  key={issue.number}
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover group"
                >
                  <CircleDot size={12} className="mt-0.5 shrink-0 text-green-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[11px] text-foreground">
                        {issue.title}
                      </span>
                      <ExternalLink size={10} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>#{issue.number}</span>
                      <span>{issue.author}</span>
                      <span>{timeAgo(issue.updatedAt)}</span>
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {issue.labels.map((label) => (
                          <span
                            key={label}
                            className="inline-flex items-center gap-0.5 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[9px] text-muted-foreground"
                          >
                            <Tag size={8} />
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {/* Actions */}
        <SectionHeader
          icon={<Play size={12} />}
          label="Actions"
          count={data.workflowRuns.length}
          expanded={expandedSections.actions}
          onToggle={() => toggleSection("actions")}
        />
        {expandedSections.actions && (
          <div>
            {data.workflowRuns.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">No recent workflow runs</p>
            ) : (
              data.workflowRuns.map((run) => (
                <a
                  key={run.id}
                  href={run.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover group"
                >
                  <span className="mt-0.5 shrink-0">
                    <RunStatusIcon status={run.status} conclusion={run.conclusion} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[11px] text-foreground">
                        {run.name}
                      </span>
                      <ExternalLink size={10} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{run.branch}</span>
                      <span>{run.event}</span>
                      <span>{timeAgo(run.createdAt)}</span>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  count,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 border-b border-border/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
      <span className="ml-auto text-[10px]">{count}</span>
      <span className="text-[10px]">{expanded ? "−" : "+"}</span>
    </button>
  );
}
