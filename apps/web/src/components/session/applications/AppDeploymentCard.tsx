import { ExternalLink, Globe2, LoaderCircle } from "lucide-react";
import type { AppDeployment } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { Button } from "../../ui/button";
import { displayApplicationStatus } from "./session-applications-operations";

export function AppDeploymentCard({
  deployment,
  pending,
  onPublish,
}: {
  deployment?: AppDeployment;
  pending: boolean;
  onPublish: () => void;
}) {
  return (
    <section className="space-y-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Published app
      </p>
      <div className="rounded-md border border-border/70 bg-background/35 px-2.5 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {deployment ? displayApplicationStatus(deployment.status) : "Not published"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {deployment
                ? `Checkpoint ${shortSha(deployment.commitSha)}`
                : "Publishing uses your latest committed checkpoint."}
            </p>
            {deployment?.errorMessage ? (
              <p className="mt-1 text-[11px] text-destructive">{deployment.errorMessage}</p>
            ) : null}
          </div>
          <Button size="sm" variant="outline" disabled={pending} onClick={onPublish}>
            {pending ? <LoaderCircle size={13} className="animate-spin" /> : <Globe2 size={13} />}
            {deployment ? "Publish again" : "Publish"}
          </Button>
        </div>
        {deployment?.url && deployment.status === "live" ? (
          <a
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            href={deployment.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="truncate">{deployment.url}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
