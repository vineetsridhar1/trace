export interface ModelOption {
  value: string;
  label: string;
  contextWindowTokens?: number;
}

const CLAUDE_CODE_MODELS: readonly ModelOption[] = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", contextWindowTokens: 200_000 },
  { value: "claude-opus-4-6", label: "Opus 4.6", contextWindowTokens: 200_000 },
  { value: "claude-opus-4-6[1m]", label: "Opus 4.6 (1M)", contextWindowTokens: 1_000_000 },
  { value: "claude-haiku-4-5", label: "Haiku 4.5", contextWindowTokens: 200_000 },
];

const CODEX_MODELS: readonly ModelOption[] = [
  { value: "gpt-5.4", label: "GPT-5.4", contextWindowTokens: 1_050_000 },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex", contextWindowTokens: 400_000 },
  { value: "gpt-5.2-codex", label: "GPT-5.2 Codex", contextWindowTokens: 400_000 },
  { value: "gpt-5.2", label: "GPT-5.2", contextWindowTokens: 400_000 },
  { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max", contextWindowTokens: 400_000 },
  { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini", contextWindowTokens: 400_000 },
];

const MODEL_OPTIONS_BY_TOOL: Readonly<Record<string, readonly ModelOption[]>> = {
  claude_code: CLAUDE_CODE_MODELS,
  codex: CODEX_MODELS,
};

const DEFAULT_MODEL_BY_TOOL: Readonly<Record<string, string>> = {
  claude_code: "claude-sonnet-4-6",
  codex: "gpt-5.4",
};

const MODEL_LABEL_MAP = new Map<string, string>(
  Object.values(MODEL_OPTIONS_BY_TOOL)
    .flat()
    .map((model) => [model.value, model.label]),
);

const MODEL_CONTEXT_WINDOW_MAP = new Map<string, number>(
  Object.values(MODEL_OPTIONS_BY_TOOL)
    .flat()
    .filter((model): model is ModelOption & { contextWindowTokens: number } =>
      typeof model.contextWindowTokens === "number",
    )
    .map((model) => [model.value, model.contextWindowTokens]),
);

export function getModelsForTool(tool: string): readonly ModelOption[] {
  return MODEL_OPTIONS_BY_TOOL[tool] ?? [];
}

export function getDefaultModel(tool: string): string | undefined {
  return DEFAULT_MODEL_BY_TOOL[tool];
}

export function getModelLabel(model: string): string {
  return MODEL_LABEL_MAP.get(model) ?? model;
}

export function getModelContextWindowTokens(model: string): number | null {
  return MODEL_CONTEXT_WINDOW_MAP.get(model) ?? null;
}

export function isSupportedModel(tool: string, model: string): boolean {
  return getModelsForTool(tool).some((option) => option.value === model);
}
