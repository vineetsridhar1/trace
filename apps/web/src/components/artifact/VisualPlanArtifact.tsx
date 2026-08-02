import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import type { Artifact } from "@trace/gql";
import { Markdown } from "../ui/Markdown";
import { TraceLoader } from "../ui/trace-loader";
import { artifactFileUrl } from "./artifact-file-url";

export function VisualPlanArtifact({
  artifact,
  onContent,
}: {
  artifact: Artifact;
  onContent?: (content: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setContent(null);
    setError(null);
    fetch(artifactFileUrl(artifact.id, "plan.mdx"), {
      credentials: "include",
      headers: getAuthHeaders(),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load plan.mdx");
        return response.text();
      })
      .then((value) => {
        setContent(value);
        onContent?.(value);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load plan");
      });
    return () => controller.abort();
  }, [artifact.id, onContent]);

  // Plans reference their images relatively (assets/flow.png); resolve those against the
  // artifact rather than the page the viewer happens to be on. Plan content is agent-authored,
  // so anything that is not http(s), mailto, or an in-page anchor is dropped.
  const resolveUrl = useCallback(
    (url: string) => {
      if (url.startsWith("#") || /^(https?:|mailto:)/i.test(url)) return url;
      if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
      return artifactFileUrl(artifact.id, url);
    },
    [artifact.id],
  );

  if (error) return <p className="p-5 text-sm text-destructive">{error}</p>;
  if (content === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <TraceLoader size={18} showLabel={false} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <Markdown resolveUrl={resolveUrl}>{content}</Markdown>
    </div>
  );
}
