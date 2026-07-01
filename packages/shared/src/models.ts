export interface ModelOption {
  value: string;
  label: string;
}

export interface ModelProviderGroup {
  value: string;
  label: string;
  description: string;
  models: readonly ModelOption[];
}

export interface ReasoningEffortOption {
  value: string;
  label: string;
}

const CLAUDE_CODE_MODELS: readonly ModelOption[] = [
  { value: "claude-fable-5", label: "Fable 5" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-opus-4-8[1m]", label: "Opus 4.8 (1M)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const CODEX_MODELS: readonly ModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
];

const PI_MODELS: readonly ModelOption[] = [
  { value: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
  { value: "openai/gpt-5.4", label: "OpenAI GPT-5.4" },
  { value: "openai-codex/gpt-5.5", label: "Codex GPT-5.5 (ChatGPT)" },
  { value: "openai-codex/gpt-5.4", label: "Codex GPT-5.4 (ChatGPT)" },
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-fable-5", label: "Claude Fable 5" },
];

const CURSOR_COMPOSER_MODELS: readonly ModelOption[] = [
  { value: "auto", label: "Auto" },
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "opus-4.8", label: "Opus 4.8" },
  { value: "sonnet-4.8", label: "Sonnet 4.8" },
];

const PI_MODEL_PROVIDER_GROUPS: readonly ModelProviderGroup[] = [
  {
    value: "openai",
    label: "OpenAI API",
    description: "Uses an OpenAI API key",
    models: PI_MODELS.slice(0, 2),
  },
  {
    value: "openai-codex",
    label: "ChatGPT",
    description: "Uses a ChatGPT Plus or Pro subscription",
    models: PI_MODELS.slice(2, 4),
  },
  {
    value: "anthropic",
    label: "Claude",
    description: "Uses a Claude subscription",
    models: PI_MODELS.slice(4),
  },
];

const MODEL_OPTIONS_BY_TOOL: Readonly<Record<string, readonly ModelOption[]>> = {
  claude_code: CLAUDE_CODE_MODELS,
  codex: CODEX_MODELS,
  cursor_composer: CURSOR_COMPOSER_MODELS,
  pi: PI_MODELS,
};

const CLAUDE_CODE_REASONING_EFFORTS: readonly ReasoningEffortOption[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

const CODEX_REASONING_EFFORTS: readonly ReasoningEffortOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
];

const REASONING_EFFORT_OPTIONS_BY_TOOL: Readonly<Record<string, readonly ReasoningEffortOption[]>> =
  {
    claude_code: CLAUDE_CODE_REASONING_EFFORTS,
    codex: CODEX_REASONING_EFFORTS,
    pi: CODEX_REASONING_EFFORTS,
  };

const DEFAULT_MODEL_BY_TOOL: Readonly<Record<string, string>> = {
  claude_code: "claude-opus-4-8[1m]",
  codex: "gpt-5.5",
  cursor_composer: "auto",
  pi: "openai/gpt-5.5",
};

const DEFAULT_REASONING_EFFORT_BY_TOOL: Readonly<Record<string, string>> = {
  claude_code: "auto",
  codex: "medium",
  pi: "medium",
};

const MODEL_LABEL_MAP = new Map<string, string>(
  Object.values(MODEL_OPTIONS_BY_TOOL)
    .flat()
    .map((model) => [model.value, model.label]),
);

const REASONING_EFFORT_LABEL_MAP = new Map<string, string>(
  Object.values(REASONING_EFFORT_OPTIONS_BY_TOOL)
    .flat()
    .map((effort) => [effort.value, effort.label]),
);

export function getModelsForTool(tool: string): readonly ModelOption[] {
  return MODEL_OPTIONS_BY_TOOL[tool] ?? [];
}

export function getModelProviderGroupsForTool(tool: string): readonly ModelProviderGroup[] {
  return tool === "pi" ? PI_MODEL_PROVIDER_GROUPS : [];
}

export function getModelProviderForModel(
  tool: string,
  model: string | null | undefined,
): ModelProviderGroup | undefined {
  if (!model) return undefined;
  return getModelProviderGroupsForTool(tool).find((group) =>
    group.models.some((option) => option.value === model),
  );
}

export function getDefaultModel(tool: string): string | undefined {
  return DEFAULT_MODEL_BY_TOOL[tool];
}

export function getReasoningEffortsForTool(tool: string): readonly ReasoningEffortOption[] {
  return REASONING_EFFORT_OPTIONS_BY_TOOL[tool] ?? [];
}

export function getDefaultReasoningEffort(tool: string): string | undefined {
  return DEFAULT_REASONING_EFFORT_BY_TOOL[tool];
}

export function getModelLabel(model: string): string {
  return MODEL_LABEL_MAP.get(model) ?? model;
}

export function getReasoningEffortLabel(effort: string): string {
  return REASONING_EFFORT_LABEL_MAP.get(effort) ?? effort;
}

export function isSupportedModel(tool: string, model: string): boolean {
  return getModelsForTool(tool).some((option) => option.value === model);
}

export function isSupportedReasoningEffort(tool: string, effort: string): boolean {
  return getReasoningEffortsForTool(tool).some((option) => option.value === effort);
}
