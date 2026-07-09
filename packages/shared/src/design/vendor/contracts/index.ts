export type ExecutionProfile = "filesystem" | "text_artifact";

export type ChatSessionMode = "design" | "plan" | "chat";

export type MediaSurface = "image" | "video" | "audio";

export type MediaExecutionPolicy = {
  mode: "enabled" | "disabled";
  allowedSurfaces?: MediaSurface[];
  allowedModels?: string[];
};

export type ByokMediaDefaults = {
  imageModel?: string | null;
  videoModel?: string | null;
  speechModel?: string | null;
  speechVoice?: string | null;
};

export function executionProfileFromStreamFormat(streamFormat: string | undefined) {
  return streamFormat === "text_artifact" ? "text_artifact" : "filesystem";
}
