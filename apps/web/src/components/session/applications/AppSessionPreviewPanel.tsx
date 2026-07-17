import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function AppSessionPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const { endpoint, error, refresh } = useProjectPreviewData(sessionGroupId, "app");

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

  return <AppPreviewCanvasSkeleton error={error} onRetry={() => void refresh()} />;
}
