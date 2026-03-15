export interface ModelOption {
  value: string;
  label: string;
}

const CLAUDE_CODE_MODELS: ModelOption[] = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-opus-4-6[1m]", label: "Opus 4.6 (1M)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
];

export function getModelsForTool(tool: string): ModelOption[] {
  switch (tool) {
    case "claude_code":
      return CLAUDE_CODE_MODELS;
    case "codex":
      return CODEX_MODELS;
    default:
      return [];
  }
}

export function getDefaultModel(tool: string): string | undefined {
  switch (tool) {
    case "claude_code":
      return "claude-sonnet-4-6";
    case "codex":
      return "gpt-5.4";
    default:
      return undefined;
  }
}
