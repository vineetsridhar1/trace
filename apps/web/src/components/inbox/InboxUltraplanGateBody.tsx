import type { UltraplanHumanGateResolution } from "@trace/gql";

interface InboxUltraplanGateBodyProps {
  payload: Record<string, unknown>;
  summary?: string | null;
  sending: boolean;
  onResolve: (resolution: UltraplanHumanGateResolution) => void;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function InboxUltraplanGateBody({
  payload,
  summary,
  sending,
  onResolve,
}: InboxUltraplanGateBodyProps) {
  const recommendedAction =
    typeof payload.recommendedAction === "string" ? payload.recommendedAction : null;
  const branchName = typeof payload.branchName === "string" ? payload.branchName : null;
  const checkpointSha = typeof payload.checkpointSha === "string" ? payload.checkpointSha : null;
  const qaChecklist = stringList(payload.qaChecklist);

  return (
    <div className="space-y-3 px-4 pb-4">
      {summary || recommendedAction ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {summary ? <p>{summary}</p> : null}
          {recommendedAction ? (
            <p>
              <span className="font-medium text-foreground">Recommended:</span> {recommendedAction}
            </p>
          ) : null}
        </div>
      ) : null}

      {branchName || checkpointSha || qaChecklist.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border/60 bg-surface-deep px-3 py-2 text-xs">
          {branchName ? (
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">Branch</span>
              <span className="min-w-0 truncate text-foreground">{branchName}</span>
            </div>
          ) : null}
          {checkpointSha ? (
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">Checkpoint</span>
              <span className="min-w-0 truncate text-foreground">{checkpointSha}</span>
            </div>
          ) : null}
          {qaChecklist.length > 0 ? (
            <div className="pt-1 text-muted-foreground">
              {qaChecklist.map((item) => (
                <div key={item} className="truncate">
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={sending}
          onClick={() => onResolve("approved")}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => onResolve("resolved")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated disabled:opacity-50"
        >
          Resolve
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => onResolve("dismissed")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-elevated disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
