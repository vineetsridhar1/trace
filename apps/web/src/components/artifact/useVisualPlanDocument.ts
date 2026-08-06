import { useEffect, useState } from "react";
import { getAuthHeaders } from "@trace/client-core";
import { artifactFileUrl } from "./artifact-file-url";
import { planMarkdownForImplementation } from "./plan-html";

interface VisualPlanDocument {
  html: string | null;
  implementationContent: string;
  error: string | null;
}

export function useVisualPlanDocument(artifactId: string | null): VisualPlanDocument {
  const [document, setDocument] = useState<VisualPlanDocument>({
    html: null,
    implementationContent: "",
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setDocument({ html: null, implementationContent: "", error: null });
    if (!artifactId) return () => controller.abort();

    void (async () => {
      const response = await fetch(artifactFileUrl(artifactId, "plan.html"), {
        credentials: "include",
        headers: getAuthHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not load plan.html");

      const value = await response.text();
      if (controller.signal.aborted) return;
      setDocument({
        html: value,
        implementationContent: planMarkdownForImplementation(value),
        error: null,
      });
    })().catch((fetchError: unknown) => {
      if (controller.signal.aborted) return;
      setDocument({
        html: null,
        implementationContent: "",
        error: fetchError instanceof Error ? fetchError.message : "Could not load plan",
      });
    });

    return () => controller.abort();
  }, [artifactId]);

  return document;
}
