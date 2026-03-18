import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { RuntimeSelector } from "../session/RuntimeSelector";
import type { RuntimeInfo } from "../session/RuntimeSelector";
import { type InteractionMode, MODE_CONFIG } from "../session/interactionModes";
import { getModelsForTool, getDefaultModel, getModelLabel } from "../session/modelOptions";
import { RepoSection } from "./RepoSection";
import { cn } from "../../lib/utils";

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

interface SessionFormFieldsProps {
  tool: string;
  model: string | undefined;
  runtimeInstanceId: string | undefined;
  runtimeInfo: RuntimeInfo | null;
  repoId: string | undefined;
  branch: string;
  mode: InteractionMode;
  dialogOpen: boolean;
  onToolChange: (tool: string) => void;
  onModelChange: (model: string) => void;
  onRuntimeChange: (id: string | undefined, info: RuntimeInfo | null) => void;
  onRepoChange: (repoId: string | undefined) => void;
  onBranchChange: (branch: string) => void;
  onRuntimeInfoChange: (info: RuntimeInfo) => void;
  onModeChange: () => void;
}

export function SessionFormFields({
  tool, model, runtimeInstanceId, runtimeInfo, repoId, branch, mode, dialogOpen,
  onToolChange, onModelChange, onRuntimeChange, onRepoChange, onBranchChange,
  onRuntimeInfoChange, onModeChange,
}: SessionFormFieldsProps) {
  const modelOptions = getModelsForTool(tool);
  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Coding tool</label>
        <Select value={tool} onValueChange={(v) => { if (v) onToolChange(v); }}>
          <SelectTrigger className="w-full"><SelectValue>{TOOL_LABELS[tool] ?? tool}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="claude_code">Claude Code</SelectItem>
            <SelectItem value="codex">Codex</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {modelOptions.length > 0 && (
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Model</label>
          <Select value={model ?? ""} onValueChange={(v) => { if (v) onModelChange(v); }}>
            <SelectTrigger className="w-full"><SelectValue>{model ? getModelLabel(model) : ""}</SelectValue></SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Runtime</label>
        <RuntimeSelector tool={tool} open={dialogOpen} value={runtimeInstanceId} onChange={onRuntimeChange} />
      </div>
      <RepoSection
        repoId={repoId}
        branch={branch}
        runtimeInfo={runtimeInfo}
        onRepoChange={onRepoChange}
        onBranchChange={onBranchChange}
        onRuntimeInfoChange={onRuntimeInfoChange}
      />
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Mode</label>
        <button
          type="button"
          onClick={onModeChange}
          className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors", modeConfig.style)}
        >
          <ModeIcon size={14} className="shrink-0" />
          {modeConfig.label}
        </button>
      </div>
    </div>
  );
}
