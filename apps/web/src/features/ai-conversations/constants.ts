/** Available models for AI conversations */
export interface ModelOption {
  id: string;
  label: string;
  provider: "anthropic" | "openai";
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", provider: "anthropic" },
  { id: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5", provider: "anthropic" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "o3-mini", label: "o3-mini", provider: "openai" },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export function getModelLabel(modelId: string | null | undefined): string {
  if (!modelId) return "Default (Claude Sonnet 4.6)";
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return model?.label ?? modelId;
}
