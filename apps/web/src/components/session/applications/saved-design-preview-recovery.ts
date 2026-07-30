export const SAVED_DESIGN_PREVIEW_RETRY_MS = 3_000;
export const MAX_SAVED_DESIGN_PREVIEW_ATTEMPTS = 10;

export type SavedDesignPreviewRecoveryState = "idle" | "retry" | "unavailable";

export function getSavedDesignPreviewRecoveryState({
  projectKind,
  liveRuntimeAvailable,
  designPreviewUrl,
  attempts,
}: {
  projectKind: "app" | "design" | "pdf" | "animation";
  liveRuntimeAvailable: boolean;
  designPreviewUrl: string | null | undefined;
  attempts: number;
}): SavedDesignPreviewRecoveryState {
  if (projectKind !== "design" || liveRuntimeAvailable || designPreviewUrl) return "idle";
  return attempts >= MAX_SAVED_DESIGN_PREVIEW_ATTEMPTS ? "unavailable" : "retry";
}
