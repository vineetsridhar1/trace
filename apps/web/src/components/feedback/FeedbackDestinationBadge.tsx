import { GitBranch, Send } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";

type EntitySummary = { name?: string | null };

export function FeedbackDestinationBadge({ sessionId }: { sessionId: string | null }) {
  const sessionName = useEntityField("sessions", sessionId ?? "", "name") as string | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId ?? "", "sessionGroupId") as
    | string
    | null
    | undefined;
  const groupName = useEntityField("sessionGroups", sessionGroupId ?? "", "name") as
    | string
    | undefined;
  const branch = useEntityField("sessions", sessionId ?? "", "branch") as string | null | undefined;
  const repo = useEntityField("sessions", sessionId ?? "", "repo") as
    | EntitySummary
    | null
    | undefined;

  const label = sessionName ?? "No session selected";
  const context = [groupName, repo?.name].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 shadow-2xl backdrop-blur",
        sessionId
          ? "border-emerald-400/30 bg-emerald-950/70 text-emerald-50"
          : "border-destructive/40 bg-destructive/20 text-destructive-foreground",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Send className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">
          Feedback will be sent to
        </p>
        <p className="truncate text-sm font-semibold">{label}</p>
        {(context || branch) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-white/65">
            {context && <span className="truncate">{context}</span>}
            {branch && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <GitBranch className="size-3 shrink-0" />
                <span className="truncate">{branch}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
