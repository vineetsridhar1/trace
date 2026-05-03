export interface ModelOption {
  value: string;
  label: string;
  defaultEffort?: string;
  effortLevels?: readonly EffortLevelOption[];
}

export interface EffortLevelOption {
  value: string;
  label: string;
  description?: string;
}

const CODEX_EFFORT_LEVELS: readonly EffortLevelOption[] = [
  { value: "low", label: "Low", description: "Fast responses with lighter reasoning" },
  { value: "medium", label: "Medium", description: "Balanced speed and reasoning depth" },
  { value: "high", label: "High", description: "Greater reasoning depth for complex work" },
  { value: "xhigh", label: "Extra High", description: "Maximum reasoning depth for hard tasks" },
];

const CLAUDE_CODE_EFFORT_LEVELS: readonly EffortLevelOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];

const CLAUDE_CODE_MODELS: readonly ModelOption[] = [
  {
    value: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    defaultEffort: "medium",
    effortLevels: CLAUDE_CODE_EFFORT_LEVELS,
  },
  {
    value: "claude-opus-4-7",
    label: "Opus 4.7",
    defaultEffort: "medium",
    effortLevels: CLAUDE_CODE_EFFORT_LEVELS,
  },
  {
    value: "claude-opus-4-7[1m]",
    label: "Opus 4.7 (1M)",
    defaultEffort: "medium",
    effortLevels: CLAUDE_CODE_EFFORT_LEVELS,
  },
  {
    value: "claude-haiku-4-5",
    label: "Haiku 4.5",
    defaultEffort: "medium",
    effortLevels: CLAUDE_CODE_EFFORT_LEVELS,
  },
];

const CODEX_MODELS: readonly ModelOption[] = [
  {
    value: "gpt-5.5",
    label: "GPT-5.5",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
  {
    value: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
  {
    value: "gpt-5.2-codex",
    label: "GPT-5.2 Codex",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
  {
    value: "gpt-5.2",
    label: "GPT-5.2",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
  {
    value: "gpt-5.1-codex-max",
    label: "GPT-5.1 Codex Max",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
  {
    value: "gpt-5.1-codex-mini",
    label: "GPT-5.1 Codex Mini",
    defaultEffort: "medium",
    effortLevels: CODEX_EFFORT_LEVELS,
  },
];

const MODEL_OPTIONS_BY_TOOL: Readonly<Record<string, readonly ModelOption[]>> = {
  claude_code: CLAUDE_CODE_MODELS,
  codex: CODEX_MODELS,
};

const DEFAULT_MODEL_BY_TOOL: Readonly<Record<string, string>> = {
  claude_code: "claude-opus-4-7[1m]",
  codex: "gpt-5.5",
};

const MODEL_LABEL_MAP = new Map<string, string>(
  Object.values(MODEL_OPTIONS_BY_TOOL)
    .flat()
    .map((model) => [model.value, model.label]),
);

const MODEL_OPTION_MAP = new Map<string, ModelOption>(
  Object.values(MODEL_OPTIONS_BY_TOOL)
    .flat()
    .map((model) => [model.value, model]),
);

const EFFORT_LABEL_MAP = new Map<string, string>(
  [...CODEX_EFFORT_LEVELS, ...CLAUDE_CODE_EFFORT_LEVELS].map((effort) => [
    effort.value,
    effort.label,
  ]),
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

export function getEffortLevelsForModel(model: string): readonly EffortLevelOption[] {
  return MODEL_OPTION_MAP.get(model)?.effortLevels ?? [];
}

export function getDefaultEffort(model: string | null | undefined): string | undefined {
  if (!model) return undefined;
  return MODEL_OPTION_MAP.get(model)?.defaultEffort;
}

export function getEffortLabel(effort: string): string {
  return EFFORT_LABEL_MAP.get(effort) ?? effort;
}

export function isSupportedEffort(model: string, effort: string): boolean {
  return getEffortLevelsForModel(model).some((option) => option.value === effort);
}
