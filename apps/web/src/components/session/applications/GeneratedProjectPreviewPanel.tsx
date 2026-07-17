import { useEntityStore } from "@trace/client-core";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { SavedDesignPreview } from "./SavedDesignPreview";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function GeneratedProjectPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const savedDesignPreviewUrl = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.designPreviewUrl as string | null | undefined,
  );
  const { endpoint, error, refresh } = useProjectPreviewData(sessionGroupId, "design");

  if (endpoint)
    return (
      <AppPreview
        key={endpoint.id}
        endpointId={endpoint.id}
        status="running"
        fill
        title="Live design preview"
      />
    );

  if (savedDesignPreviewUrl) return <SavedDesignPreview url={savedDesignPreviewUrl} />;

  return (
    <AppPreviewCanvasSkeleton
      error={error}
      onRetry={() => void refresh()}
      projectKind="design"
    />
  );
}
