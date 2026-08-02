import { useEffect } from "react";
import type { Artifact } from "@trace/gql";
import { TraceLoader } from "../ui/trace-loader";
import { useVisualPlanDocument } from "./useVisualPlanDocument";
import { sandboxedPlanHtml } from "./plan-html";

export function VisualPlanArtifact({
  artifact,
  onContent,
}: {
  artifact: Artifact;
  onContent?: (content: string) => void;
}) {
  const planPath = artifact.manifest.files.some((file) => file.path === "plan.html")
    ? "plan.html"
    : "plan.mdx";
  const { html, implementationContent, error } = useVisualPlanDocument(artifact.id, planPath);

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
    // The plan is agent-authored markup. The sandbox removes scripting and app access; the
    // injected CSP independently blocks network, navigation, frames, and form submission.
    <iframe
      key={artifact.id}
      title="Implementation plan"
      srcDoc={sandboxedPlanHtml(html)}
      sandbox=""
      className="size-full min-h-full border-0 bg-background"
    />
  );
}
