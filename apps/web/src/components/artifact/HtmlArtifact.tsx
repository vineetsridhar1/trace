import { useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import { TraceLoader } from "../ui/trace-loader";
import { artifactFileUrl } from "./artifact-file-url";
import { sandboxedPlanHtml } from "./plan-html";

export function HtmlArtifact({ artifactId }: { artifactId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setHtml(null);
    setError(null);

    void (async () => {
      const response = await fetch(artifactFileUrl(artifactId, "index.html"), {
        credentials: "include",
        headers: getAuthHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not load index.html");
      const content = await response.text();
      if (!controller.signal.aborted) setHtml(content);
    })().catch((fetchError: unknown) => {
      if (controller.signal.aborted) return;
      setError(fetchError instanceof Error ? fetchError.message : "Could not load index.html");
    });

    return () => controller.abort();
  }, [artifactId]);

  if (error) return <p className="p-5 text-sm text-destructive">{error}</p>;
  if (html === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <TraceLoader size={18} showLabel={false} />
      </div>
    );
  }

  return (
    <iframe
      title="index.html"
      srcDoc={sandboxedPlanHtml(html)}
      sandbox=""
      className="size-full min-h-[60vh] border-0 bg-background"
    />
  );
}
