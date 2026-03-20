export interface ModelOption {
  value: string;
  label: string;
}

const CLAUDE_CODE_MODELS: readonly ModelOption[] = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-opus-4-6[1m]", label: "Opus 4.6 (1M)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const CODEX_MODELS: readonly ModelOption[] = [
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
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

export function getModelsForTool(tool: string): readonly ModelOption[] {
  return MODEL_OPTIONS_BY_TOOL[tool] ?? [];
}

export function getDefaultModel(tool: string): string | undefined {
  return DEFAULT_MODEL_BY_TOOL[tool];
}

export function getModelLabel(model: string): string {
  return MODEL_LABEL_MAP.get(model) ?? model;
}

export function isSupportedModel(tool: string, model: string): boolean {
  return getModelsForTool(tool).some((option) => option.value === model);
}
