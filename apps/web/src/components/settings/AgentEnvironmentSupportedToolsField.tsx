import type { CodingTool } from "@trace/gql";
import { CODING_TOOL_OPTIONS } from "./agent-environment-utils";

type Props = {
  supportedTools: CodingTool[];
  onToggle: (tool: CodingTool) => void;
};

export function AgentEnvironmentSupportedToolsField({ supportedTools, onToggle }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface-deep p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Supported tools</div>
      <div className="flex flex-wrap gap-4">
        {CODING_TOOL_OPTIONS.map((tool) => (
          <label key={tool.value} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={supportedTools.includes(tool.value)}
              onChange={() => onToggle(tool.value)}
              className="h-4 w-4 rounded border-border"
            />
            {tool.label}
          </label>
        ))}
      </div>
    </div>
  );
}
