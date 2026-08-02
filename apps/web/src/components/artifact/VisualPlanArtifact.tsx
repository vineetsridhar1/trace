import { useEffect } from "react";
import type { Artifact } from "@trace/gql";
import { TraceLoader } from "../ui/trace-loader";
import { useVisualPlanDocument } from "./useVisualPlanDocument";

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
    // The plan is agent-authored markup. An empty sandbox gives it an opaque origin with no
    // scripting, no network, and no reach back into the app.
    <iframe
      key={artifact.id}
      title="Implementation plan"
      srcDoc={html}
      sandbox=""
      className="size-full min-h-full border-0 bg-background"
    />
  );
}
