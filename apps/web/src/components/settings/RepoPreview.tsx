import type { DetectedRepo } from "./repo-dialog-types";

export function RepoPreview({ repo }: { repo: DetectedRepo }) {
  return (
    <div className="rounded-lg border border-border bg-surface-deep p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{repo.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{repo.defaultBranch}</span>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {repo.remoteUrl ?? "No remote configured"}
      </p>
    </div>
  );
}
