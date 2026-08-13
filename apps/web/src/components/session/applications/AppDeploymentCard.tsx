import { ExternalLink } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import type { AppDeploymentStatus } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { displayApplicationStatus } from "./session-applications-operations";

export function AppDeploymentCard({ deploymentId }: { deploymentId?: string }) {
  const status = useEntityField("appDeployments", deploymentId ?? "", "status") as
    | AppDeploymentStatus
    | undefined;
  const commitSha = useEntityField("appDeployments", deploymentId ?? "", "commitSha") as
    | string
    | undefined;
  const target = useEntityField("appDeployments", deploymentId ?? "", "target") as
    | string
    | undefined;
  const errorMessage = useEntityField("appDeployments", deploymentId ?? "", "errorMessage") as
    | string
    | null
    | undefined;
  const url = useEntityField("appDeployments", deploymentId ?? "", "url") as
    | string
    | null
    | undefined;
  return (
    <section className="space-y-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Published app
      </p>
      <div className="rounded-md border border-border/70 bg-background/35 px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {status ? displayApplicationStatus(status) : "Not published"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {commitSha
              ? `${target === "static" ? "Static" : "Service"} · Commit ${shortSha(commitSha)}`
              : "Ask Trace to publish; the AI will inspect and choose the deployment facts."}
          </p>
          {errorMessage ? (
            <p className="mt-1 text-[11px] text-destructive">{errorMessage}</p>
          ) : null}
        </div>
        {url && status === "live" ? (
          <a
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="truncate">{url}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
