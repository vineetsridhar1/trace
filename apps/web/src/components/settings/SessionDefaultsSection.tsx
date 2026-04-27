import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { usePreferencesStore } from "../../stores/preferences";
import { getModelsForTool, getDefaultModel, getModelLabel } from "../session/modelOptions";

const TOOL_OPTIONS = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
] as const;

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

export function SessionDefaultsSection() {
  const defaultTool = usePreferencesStore((s: { defaultTool: string | null }) => s.defaultTool);
  const defaultModel = usePreferencesStore((s: { defaultModel: string | null }) => s.defaultModel);
  const setDefaultTool = usePreferencesStore(
    (s: { setDefaultTool: (tool: string | null) => void }) => s.setDefaultTool,
  );
  const setDefaultModel = usePreferencesStore(
    (s: { setDefaultModel: (model: string | null) => void }) => s.setDefaultModel,
  );

  const effectiveTool = defaultTool ?? "claude_code";
  const modelOptions = getModelsForTool(effectiveTool);

  const handleToolChange = (value: string | null) => {
    if (!value || value === "__none__") {
      setDefaultTool(null);
      setDefaultModel(null);
    } else {
      setDefaultTool(value);
      // Reset model to the tool's default when tool changes
      setDefaultModel(getDefaultModel(value) ?? null);
    }
  };

  const handleModelChange = (value: string | null) => {
    if (!value || value === "__none__") {
      setDefaultModel(null);
    } else {
      setDefaultModel(value);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Session Defaults</h2>
        <p className="text-sm text-muted-foreground">
          Set your preferred coding tool and model. New sessions will use these by default.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-deep p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              Default Coding Tool
            </label>
            <Select value={defaultTool ?? "__none__"} onValueChange={handleToolChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {defaultTool ? (TOOL_LABELS[defaultTool] ?? defaultTool) : "None (use default)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (use default)</SelectItem>
                {TOOL_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Default Model</label>
            <Select value={defaultModel ?? "__none__"} onValueChange={handleModelChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {defaultModel ? getModelLabel(defaultModel) : "None (use default)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (use default)</SelectItem>
                {modelOptions.map((m: { value: string; label: string }) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
