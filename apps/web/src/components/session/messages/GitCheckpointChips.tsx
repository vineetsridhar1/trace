import type { GitCheckpoint } from "@trace/gql";
import { GitCommitHorizontal } from "lucide-react";
import { shortSha } from "@trace/shared";
import { useCheckpointOpen } from "../CheckpointOpenContext";

const MAX_VISIBLE_CHECKPOINT_CHIPS = 3;

export function GitCheckpointChips({ checkpoints }: { checkpoints: GitCheckpoint[] }) {
  const openCheckpointPanel = useCheckpointOpen();

  if (checkpoints.length === 0) return null;

  const visibleCheckpoints = checkpoints.slice(0, MAX_VISIBLE_CHECKPOINT_CHIPS);
  const hiddenCount = checkpoints.length - visibleCheckpoints.length;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {visibleCheckpoints.map((checkpoint) => (
        <button
          key={checkpoint.id}
          type="button"
          onClick={() => openCheckpointPanel?.(checkpoint.id)}
          className="group/checkpoint ml-auto flex w-fit max-w-[4.85rem] items-center gap-1.5 overflow-hidden rounded-md border border-border/45 bg-muted/25 px-2 py-1 text-[10px] text-muted-foreground transition-[max-width,background-color,border-color,color] duration-200 ease-out hover:max-w-full hover:border-border/70 hover:bg-muted/45 hover:text-foreground"
          title={checkpoint.subject}
        >
          <GitCommitHorizontal size={11} className="shrink-0 opacity-70" />
          <span className="shrink-0 font-mono text-[10px] text-foreground/85">
            {shortSha(checkpoint.commitSha)}
          </span>
          <span className="max-w-0 min-w-0 truncate opacity-0 transition-[max-width,opacity] duration-200 ease-out group-hover/checkpoint:max-w-[20rem] group-hover/checkpoint:opacity-100">
            {checkpoint.subject}
          </span>
        </button>
      ))}
      {hiddenCount > 0 ? (
        <div className="ml-auto w-fit rounded-md border border-border/35 bg-muted/15 px-2 py-1 text-[10px] text-muted-foreground">
          +{hiddenCount} more checkpoint{hiddenCount === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}
