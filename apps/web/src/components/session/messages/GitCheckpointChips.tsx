import type { GitCheckpoint } from "@trace/gql";
import { GitCommitHorizontal } from "lucide-react";
import { shortSha } from "@trace/shared";

export function GitCheckpointChips({
  checkpoints,
}: {
  checkpoints: GitCheckpoint[];
}) {
  if (checkpoints.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {checkpoints.map((checkpoint) => (
        <div
          key={checkpoint.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground"
          title={checkpoint.subject}
        >
          <GitCommitHorizontal size={12} className="shrink-0" />
          <span className="font-mono text-foreground">{shortSha(checkpoint.commitSha)}</span>
          <span className="max-w-48 truncate">{checkpoint.subject}</span>
        </div>
      ))}
    </div>
  );
}
