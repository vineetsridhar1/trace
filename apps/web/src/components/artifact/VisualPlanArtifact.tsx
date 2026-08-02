import { useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import type { Artifact } from "@trace/gql";
import { TraceLoader } from "../ui/trace-loader";
import { artifactFileUrl } from "./artifact-file-url";
import { escapeHtml, planMarkupForImplementation } from "./plan-html";

export function VisualPlanArtifact({
  artifact,
  onContent,
}: {
  artifact: Artifact;
  onContent?: (content: string) => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const planPath = artifact.manifest.files.some((file) => file.path === "plan.html")
    ? "plan.html"
    : "plan.mdx";

  useEffect(() => {
    const controller = new AbortController();
    setHtml(null);
    setError(null);
    fetch(artifactFileUrl(artifact.id, planPath), {
      credentials: "include",
      headers: getAuthHeaders(),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${planPath}`);
        return response.text();
      })
      .then((value) => {
        // Plans published before the HTML format are Markdown; show them as legible plain text.
        setHtml(planPath === "plan.html" ? value : `<pre>${escapeHtml(value)}</pre>`);
        onContent?.(planPath === "plan.html" ? planMarkupForImplementation(value) : value);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load plan");
      });
    return () => controller.abort();
  }, [artifact.id, onContent, planPath]);

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
