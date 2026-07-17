import type { GitCheckpoint } from "@trace/gql";

export function latestSavedDesignPreviewUrl(
  checkpoints: GitCheckpoint[] | null | undefined,
): string | null {
  return (
    (checkpoints ?? [])
      .filter(
        (checkpoint) => checkpoint.previewStatus === "captured" && Boolean(checkpoint.previewUrl),
      )
      .sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0]?.previewUrl ?? null
  );
}

export function hasSavedDesignPreview(
  groupPreviewUrl: string | null | undefined,
  checkpoints: GitCheckpoint[] | null | undefined,
): boolean {
  return Boolean(groupPreviewUrl) || latestSavedDesignPreviewUrl(checkpoints) !== null;
}
