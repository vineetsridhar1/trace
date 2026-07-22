import { useEntityStore } from "@trace/client-core";
import type { GitCheckpoint } from "@trace/gql";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { SavedDesignPreview } from "./SavedDesignPreview";
import { SavedPdfPreview } from "./SavedPdfPreview";
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
        projectKind={projectKind}
        sessionGroupId={projectKind === "pdf" ? sessionGroupId : undefined}
        manualSessionGroupId={sessionGroupId}
      />
    );

  if (projectKind === "design" && previewUrl) return <SavedDesignPreview url={previewUrl} />;
  if (projectKind === "pdf" && savedPdfUrl)
    return <SavedPdfPreview url={savedPdfUrl} downloadUrl={savedPdfDownloadUrl} />;

  return (
    <AppPreviewCanvasSkeleton
      error={error}
      onRetry={() => void refresh()}
      projectKind={projectKind}
    />
  );
}
