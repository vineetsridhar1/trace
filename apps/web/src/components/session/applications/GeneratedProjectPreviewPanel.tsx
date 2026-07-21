import { useEntityField, useEntityStore } from "@trace/client-core";
import type { GitCheckpoint } from "@trace/gql";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { SavedDesignPreview } from "./SavedDesignPreview";
import { SavedPdfPreview } from "./SavedPdfPreview";
import type { PdfPageFormat } from "./PdfPreviewControls";
import { savedDesignPreviewUrl } from "./saved-design-preview";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function GeneratedProjectPreviewPanel({
  sessionGroupId,
  projectKind = "design",
}: {
  sessionGroupId: string;
  projectKind?: "design" | "pdf";
}) {
  const groupPreviewUrl = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.designPreviewUrl as string | null | undefined,
  );
  const checkpoints = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.gitCheckpoints as GitCheckpoint[] | undefined,
  );
  const pdfPageWidth = useEntityField("sessionGroups", sessionGroupId, "pdfPageWidth") as
    | number
    | undefined;
  const pdfPageHeight = useEntityField("sessionGroups", sessionGroupId, "pdfPageHeight") as
    | number
    | undefined;
  const pdfPageUnit = useEntityField("sessionGroups", sessionGroupId, "pdfPageUnit") as
    | "mm"
    | "in"
    | undefined;
  const pdfFormat: PdfPageFormat | undefined =
    typeof pdfPageWidth === "number" &&
    typeof pdfPageHeight === "number" &&
    (pdfPageUnit === "mm" || pdfPageUnit === "in")
      ? { width: pdfPageWidth, height: pdfPageHeight, unit: pdfPageUnit }
      : undefined;
  const previewUrl = savedDesignPreviewUrl(groupPreviewUrl, checkpoints);
  const { endpoint, error, refresh, savedPdfDownloadUrl, savedPdfUrl } = useProjectPreviewData(
    sessionGroupId,
    projectKind,
  );

  if (endpoint)
    return (
      <AppPreview
        key={endpoint.id}
        endpointId={endpoint.id}
        status="running"
        fill
        desktopViewport={projectKind === "pdf"}
        title={`Live ${projectKind} preview`}
        projectKind={projectKind === "pdf" ? "pdf" : undefined}
        sessionGroupId={projectKind === "pdf" ? sessionGroupId : undefined}
      />
    );

  if (projectKind === "design" && previewUrl) return <SavedDesignPreview url={previewUrl} />;
  if (projectKind === "pdf" && savedPdfUrl)
    return (
      <SavedPdfPreview
        url={savedPdfUrl}
        downloadUrl={savedPdfDownloadUrl}
        format={pdfFormat}
      />
    );

  return (
    <AppPreviewCanvasSkeleton
      error={error}
      onRetry={() => void refresh()}
      projectKind={projectKind}
    />
  );
}
