import { useEntityStore } from "@trace/client-core";
import type { GitCheckpoint } from "@trace/gql";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { SavedDesignPreview } from "./SavedDesignPreview";
import { savedDesignPreviewUrl } from "./saved-design-preview";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function GeneratedProjectPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const groupPreviewUrl = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.designPreviewUrl as string | null | undefined,
  );
  const checkpoints = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.gitCheckpoints as GitCheckpoint[] | undefined,
  );
  const previewUrl = savedDesignPreviewUrl(groupPreviewUrl, checkpoints);
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

  if (previewUrl) return <SavedDesignPreview url={previewUrl} />;

  return (
    <AppPreviewCanvasSkeleton
      error={error}
      onRetry={() => void refresh()}
      projectKind="design"
    />
  );
}
