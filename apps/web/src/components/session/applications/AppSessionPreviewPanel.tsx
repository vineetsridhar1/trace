import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { PreviewRecoveryActions } from "./PreviewRecoveryActions";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function AppSessionPreviewPanel({
  sessionGroupId,
  sessionId,
}: {
  sessionGroupId: string;
  sessionId: string | null;
}) {
  const { endpoint, error, failedProcess, refresh } = useProjectPreviewData(sessionGroupId, "app");

  if (endpoint) {
    return (
      <AppPreview
        key={endpoint.id}
        endpointId={endpoint.id}
        status="running"
        fill
        desktopViewport
      />
    );
  }

  return (
    <div className="relative h-full">
      <AppPreviewCanvasSkeleton error={error} onRetry={() => void refresh()} />
      {failedProcess ? (
        <PreviewRecoveryActions
          className="absolute bottom-5 left-1/2 -translate-x-1/2"
          process={failedProcess}
          sessionGroupId={sessionGroupId}
          sessionId={sessionId}
          onRetried={refresh}
        />
      ) : null}
    </div>
  );
}
