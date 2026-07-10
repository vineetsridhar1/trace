import type { DetectedRepo } from "./repo-dialog-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { truncatePathMiddle } from "./repo-preview-path";

export function RepoPreview({ repo }: { repo: DetectedRepo }) {
  const path = repo.remoteUrl ?? "No remote configured";
  const pathPreview = truncatePathMiddle(path);
  const isTruncated = pathPreview !== path;

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-surface-deep p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{repo.name}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{repo.defaultBranch}</span>
      </div>
      {isTruncated ? (
        <Tooltip>
          <TooltipTrigger render={<p className="min-w-0 truncate text-xs text-muted-foreground" />}>
            {pathPreview}
          </TooltipTrigger>
          <TooltipContent className="max-w-96 break-all text-xs">{path}</TooltipContent>
        </Tooltip>
      ) : (
        <p className="min-w-0 truncate text-xs text-muted-foreground">{path}</p>
      )}
    </div>
  );
}
