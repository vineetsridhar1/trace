import { useEntityStore } from "@trace/client-core";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { isLivePreviewRuntimeAvailable } from "./app-preview-readiness";
import { PublishedAppPreview } from "./PublishedAppPreview";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function AppSessionPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const runtimeState = useEntityStore((s) => {
    const connection = s.sessionGroups[sessionGroupId]?.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
    return "state" in connection ? connection.state : null;
  });
  const { endpoint, error, publishedUrl, refresh } = useProjectPreviewData(sessionGroupId, "app");

  if (endpoint && isLivePreviewRuntimeAvailable(runtimeState)) {
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

  if (publishedUrl) return <PublishedAppPreview url={publishedUrl} />;

  return <AppPreviewCanvasSkeleton error={error} onRetry={() => void refresh()} />;
}
