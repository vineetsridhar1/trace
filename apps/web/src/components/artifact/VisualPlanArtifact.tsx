import { useEffect } from "react";
import type { Artifact } from "@trace/gql";
import { TraceLoader } from "../ui/trace-loader";
import { useVisualPlanDocument } from "./useVisualPlanDocument";
import { visualPlanHtmlPath } from "./visual-plan-file";
import { PLAN_IFRAME_SANDBOX, sandboxedPlanHtml } from "./plan-html";

export function VisualPlanArtifact({
  artifact,
  onContent,
}: {
  artifact: Artifact;
  onContent?: (content: string) => void;
}) {
  const { html, implementationContent, error } = useVisualPlanDocument(
    artifact.id,
    visualPlanHtmlPath(artifact),
  );

  useEffect(() => {
    if (implementationContent) onContent?.(implementationContent);
  }, [implementationContent, onContent]);

  if (error) return <p className="p-5 text-sm text-destructive">{error}</p>;
  if (html === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <TraceLoader size={18} showLabel={false} />
      </div>
    );
  }
  return (
    // The plan is agent-authored markup. Scripts may modify this opaque-origin document, while
    // the sandbox removes app access and the CSP blocks network, frames, and form submission.
    <iframe
      key={artifact.id}
      title="Implementation plan"
      srcDoc={sandboxedPlanHtml(html)}
      sandbox={PLAN_IFRAME_SANDBOX}
      className="size-full min-h-full border-0 bg-background"
    />
  );
}
