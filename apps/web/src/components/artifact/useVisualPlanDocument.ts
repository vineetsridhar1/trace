import { useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import { artifactFileUrl } from "./artifact-file-url";
import { escapeHtml, planMarkdownForImplementation } from "./plan-html";

interface VisualPlanDocument {
  html: string | null;
  implementationContent: string;
  error: string | null;
}

export function useVisualPlanDocument(
  artifactId: string | null,
  preferredPath?: "plan.html" | "plan.mdx",
): VisualPlanDocument {
  const [document, setDocument] = useState<VisualPlanDocument>({
    html: null,
    implementationContent: "",
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setDocument({ html: null, implementationContent: "", error: null });
    if (!artifactId) return () => controller.abort();

    const paths: Array<"plan.html" | "plan.mdx"> = preferredPath
      ? [preferredPath]
      : ["plan.html", "plan.mdx"];

    void (async () => {
      for (const [index, path] of paths.entries()) {
        const response = await fetch(artifactFileUrl(artifactId, path), {
          credentials: "include",
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        if (response.status === 404 && index < paths.length - 1) continue;
        if (!response.ok) throw new Error(`Could not load ${path}`);

        const value = await response.text();
        if (controller.signal.aborted) return;
        setDocument({
          html: path === "plan.html" ? value : `<pre>${escapeHtml(value)}</pre>`,
          implementationContent:
            path === "plan.html" ? planMarkdownForImplementation(value) : value,
          error: null,
        });
        return;
      }
    })().catch((fetchError: unknown) => {
      if (controller.signal.aborted) return;
      setDocument({
        html: null,
        implementationContent: "",
        error: fetchError instanceof Error ? fetchError.message : "Could not load plan",
      });
    });

    return () => controller.abort();
  }, [artifactId, preferredPath]);

  return document;
}
