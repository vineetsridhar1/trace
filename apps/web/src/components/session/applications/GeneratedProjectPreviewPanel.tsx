import { useEntityStore } from "@trace/client-core";
import type { GitCheckpoint } from "@trace/gql";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { PreviewRecoveryActions } from "./PreviewRecoveryActions";
import { SavedDesignPreview } from "./SavedDesignPreview";
import { SavedPdfPreview } from "./SavedPdfPreview";
import { savedDesignPreviewUrl } from "./saved-design-preview";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function GeneratedProjectPreviewPanel({
  sessionGroupId,
  sessionId,
  projectKind = "design",
}: {
  sessionGroupId: string;
  sessionId: string | null;
  projectKind?: "design" | "pdf";
}) {
  const groupPreviewUrl = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.designPreviewUrl as string | null | undefined,
  );
  const checkpoints = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.gitCheckpoints as GitCheckpoint[] | undefined,
  );
  const previewUrl = savedDesignPreviewUrl(groupPreviewUrl, checkpoints);
  const { endpoint, error, failedProcess, refresh, savedPdfDownloadUrl, savedPdfUrl } =
    useProjectPreviewData(sessionGroupId, projectKind);

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

  const recovery = failedProcess ? (
    <PreviewRecoveryActions
      className="absolute bottom-5 left-1/2 -translate-x-1/2"
      process={failedProcess}
      sessionGroupId={sessionGroupId}
      sessionId={sessionId}
      onRetried={refresh}
    />
  ) : null;

  if (projectKind === "design" && previewUrl)
    return (
      <div className="relative h-full">
        <SavedDesignPreview url={previewUrl} />
        {recovery}
      </div>
    );
  if (projectKind === "pdf" && savedPdfUrl)
    return (
      <div className="relative h-full">
        <SavedPdfPreview url={savedPdfUrl} downloadUrl={savedPdfDownloadUrl} />
        {recovery}
      </div>
    );

  return (
    <div className="relative h-full">
      <AppPreviewCanvasSkeleton
        error={error}
        onRetry={() => void refresh()}
        projectKind={projectKind}
      />
      {recovery}
    </div>
  );
}
