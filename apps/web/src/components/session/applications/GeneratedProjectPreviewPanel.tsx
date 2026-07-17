import { useMemo } from "react";
import type { GitCheckpoint } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { SavedDesignPreview } from "./SavedDesignPreview";
import { latestSavedDesignPreviewUrl } from "./saved-design-preview";
import { useProjectPreviewData } from "./useProjectPreviewData";

export function GeneratedProjectPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const gitCheckpoints = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.gitCheckpoints as GitCheckpoint[] | undefined,
  );
  const { endpoint, error, refresh } = useProjectPreviewData(sessionGroupId, "design");
  const savedDesignPreviewUrl = useMemo(
    () => latestSavedDesignPreviewUrl(gitCheckpoints),
    [gitCheckpoints],
  );

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
