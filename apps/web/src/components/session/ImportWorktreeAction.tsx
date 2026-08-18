import { useState } from "react";
import { FolderGit2 } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { ImportWorktreeDialog } from "./ImportWorktreeDialog";

/**
 * Entry point for adopting an existing on-disk worktree. Only meaningful before
 * a session starts, on local hosting, and when the session has a repo — so it
 * renders nothing otherwise.
 */
export function ImportWorktreeAction({ sessionId }: { sessionId: string | null }) {
  const [open, setOpen] = useState(false);
  const agentStatus = useEntityField("sessions", sessionId ?? "", "agentStatus") as
    | string
    | undefined;
  const hosting = useEntityField("sessions", sessionId ?? "", "hosting") as string | undefined;
  const repo = useEntityField("sessions", sessionId ?? "", "repo") as
    | { id?: string }
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId ?? "", "sessionGroupId") as
    | string
    | undefined;
  const worktreeAdopted = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "worktreeAdopted",
  ) as boolean | undefined;
  const groupWorkdir = useEntityField("sessionGroups", sessionGroupId ?? "", "workdir") as
    | string
    | null
    | undefined;

  if (!sessionId) return null;

  if (worktreeAdopted) {
    return (
      <div className="mt-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-deep px-3 py-2.5 text-left">
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          <FolderGit2 size={14} className="text-muted-foreground" />
          Imported from worktree
        </span>
        {groupWorkdir ? (
          <span className="max-w-full truncate pl-6 font-mono text-[11px] text-muted-foreground">
            {groupWorkdir}
          </span>
        ) : null}
      </div>
    );
  }

  if (agentStatus !== "not_started" || hosting === "cloud" || !repo?.id) return null;

  return (
    <>
      <ImportWorktreeDialog
        sessionId={sessionId}
        repoId={repo.id}
        open={open}
        onClose={() => setOpen(false)}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <FolderGit2 size={13} className="shrink-0" />
        Working from an existing checkout? Import from worktree
      </button>
    </>
  );
}
