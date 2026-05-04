import { FileText } from "lucide-react";
import { type ProjectRunEntity, useEntityField } from "@trace/client-core";
import { Markdown } from "../ui/Markdown";

export function ProjectPlanPanel({ projectRunId }: { projectRunId: string }) {
  const initialGoal = useEntityField("projectRuns", projectRunId, "initialGoal");
  const planSummary = useEntityField("projectRuns", projectRunId, "planSummary");
  const status = useEntityField("projectRuns", projectRunId, "status") as
    | ProjectRunEntity["status"]
    | undefined;
  const content = planSummary || initialGoal || "";

  return (
    <section className="flex min-h-0 flex-col border-b border-border">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <FileText size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Plan</h2>
        <span className="ml-auto rounded-md bg-surface-deep px-2 py-0.5 text-xs text-muted-foreground">
          {status ?? "draft"}
        </span>
      </div>
      <div className="min-h-[220px] overflow-y-auto px-4 py-3">
        {content ? (
          <Markdown>{content}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">
            The planning session will keep the durable plan here as it evolves.
          </p>
        )}
      </div>
    </section>
  );
}
