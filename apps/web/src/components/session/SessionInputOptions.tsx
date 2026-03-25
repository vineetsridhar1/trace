import { useCallback } from "react";
import { gql } from "@urql/core";
import type { CodingTool } from "@trace/gql";
import { useEntityStore, useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  type InteractionMode,
  MODE_CONFIG,
} from "./interactionModes";
import { getModelsForTool, getDefaultModel } from "./modelOptions";
import { cn } from "../../lib/utils";

const UPDATE_SESSION_CONFIG_MUTATION = gql`
  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {
    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {
      id
      tool
      model
    }
  }
`;

interface SessionInputOptionsProps {
  sessionId: string;
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  isActive: boolean;
}

export function SessionInputOptions({
  sessionId,
  mode,
  onModeChange,
  isActive,
}: SessionInputOptionsProps) {
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;

  const currentTool = tool ?? "claude_code";
  const modelOptions = getModelsForTool(currentTool);
  const currentModel = model ?? getDefaultModel(currentTool);

  const handleToolChange = useCallback(async (newTool: string | null) => {
    if (!newTool) return;
    const newDefault = getDefaultModel(newTool);
    useEntityStore.getState().patch("sessions", sessionId, { tool: newTool as CodingTool, model: newDefault ?? null });
    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, tool: newTool, model: newDefault }).toPromise();
  }, [sessionId]);

  const handleModelChange = useCallback(async (newModel: string | null) => {
    if (!newModel) return;
    useEntityStore.getState().patch("sessions", sessionId, { model: newModel });
    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel }).toPromise();
  }, [sessionId]);

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="mt-2 flex items-center gap-1">
      <Select value={currentTool} onValueChange={handleToolChange} disabled={isActive}>
        <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude_code">Claude Code</SelectItem>
          <SelectItem value="codex">Codex</SelectItem>
        </SelectContent>
      </Select>
      {modelOptions.length > 0 && (
        <Select value={currentModel ?? ""} onValueChange={handleModelChange} disabled={isActive}>
          <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <button
        type="button"
        onClick={() => onModeChange(mode)}
        disabled={isActive}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          modeConfig.style,
        )}
      >
        <ModeIcon size={14} className="shrink-0" />
        {modeConfig.label}
      </button>
    </div>
  );
}
