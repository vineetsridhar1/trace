import { useEffect, useState } from "react";
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
  const documents = artifact.manifest.files.filter(
    (file) => file.mediaType === "text/mdx" || file.mediaType === "text/markdown",
  );
  const [selectedPath, setSelectedPath] = useState("plan.mdx");
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPath("plan.mdx");
  }, [artifact.id]);

  useEffect(() => {
    const controller = new AbortController();
    setContent(null);
    setError(null);
    fetch(artifactFileUrl(artifact.id, selectedPath), {
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
        if (selectedPath === "plan.mdx") onContent?.(value);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load plan");
      });
    return () => controller.abort();
  }, [artifact.id, onContent, selectedPath]);

  return (
    <div>
      {documents.length > 1 && (
        <nav className="sticky top-0 z-10 flex gap-1 border-b border-border bg-background px-4 py-2">
          {documents.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={
                file.path === selectedPath
                  ? "rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
                  : "rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface hover:text-foreground"
              }
            >
              {file.path}
            </button>
          ))}
        </nav>
      )}
      {error ? (
        <p className="p-5 text-sm text-destructive">{error}</p>
      ) : content === null ? (
        <div className="flex h-40 items-center justify-center">
          <TraceLoader size={18} showLabel={false} />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl px-6 py-5">
          <Markdown>{content}</Markdown>
        </div>
      )}
    </div>
  );
}
