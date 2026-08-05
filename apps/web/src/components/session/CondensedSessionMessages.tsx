import { ListChecks } from "lucide-react";
import { stripPromptWrapping } from "./interactionModes";
import { TraceLoader } from "../ui/trace-loader";
import type { CompactChatSummary } from "./compact-chat-summary";

export function CondensedSessionMessages({
  summary,
  active,
  bottomPadding,
}: {
  summary: CompactChatSummary;
  active: boolean;
  bottomPadding: number;
}) {
  const hasContent = summary.userText || summary.assistantText || summary.actionCount > 0;

  return (
    <div className="flex h-full flex-col justify-end overflow-hidden px-4 pt-12">
      <div
        className="space-y-4 overflow-hidden pb-4"
        style={{ marginBottom: bottomPadding }}
        aria-label="Recent chat activity"
      >
        {summary.userText ? (
          <div className="flex justify-end">
            <div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent/15 px-3 py-2.5 text-sm leading-5 text-foreground">
              <p className="line-clamp-3 whitespace-pre-wrap">
                {stripPromptWrapping(summary.userText)}
              </p>
            </div>
          </div>
        ) : null}

        {summary.actionCount > 0 || active ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {active ? <TraceLoader size={14} showLabel={false} /> : <ListChecks size={14} />}
            <span>
              {summary.actionCount > 0
                ? `${summary.actionCount} ${summary.actionCount === 1 ? "action" : "actions"}`
                : "Working"}
              {active ? " · Thinking…" : ""}
            </span>
          </div>
        ) : null}

        {summary.assistantText ? (
          <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {summary.assistantText}
          </p>
        ) : null}

        {!hasContent && !active ? (
          <p className="text-sm text-muted-foreground">Start a conversation about this design.</p>
        ) : null}
      </div>
    </div>
  );
}
