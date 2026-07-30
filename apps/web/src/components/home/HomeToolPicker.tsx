import { Check, ChevronDown, Settings } from "lucide-react";
import type { CodingTool } from "@trace/gql";
import { TOOL_OPTIONS, ToolIcon, getToolLabel } from "../session/picker/pickerShared";
import { useUIStore } from "../../stores/ui";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const TOOL_DESCRIPTIONS: Record<string, string> = {
  claude_code: "Default for Design and Code",
  codex: "OpenAI runtime",
  cursor_composer: "Cursor agent runtime",
  pi: "Fast collaborative coding",
  antigravity: "Google agent runtime",
};

export function HomeToolPicker({
  tool,
  onSelect,
}: {
  tool: CodingTool;
  onSelect: (tool: CodingTool) => void;
}) {
  const setActivePage = useUIStore((state) => state.setActivePage);
  const setSettingsInitialTab = useUIStore((state) => state.setSettingsInitialTab);

  return (
    <Popover>
      <PopoverTrigger className="flex h-7 max-w-44 items-center gap-1.5 rounded-md border border-[var(--th-edge)] bg-[var(--th-surface)] px-2.5 text-xs text-[var(--th-primary)] transition-colors hover:border-[var(--th-edge-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]">
        <ToolIcon tool={tool} className="size-3.5 shrink-0" />
        <span className="truncate">{getToolLabel(tool)}</span>
        <ChevronDown className="size-3 shrink-0 text-[var(--th-faint)]" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(320px,calc(100vw-2rem))] gap-0 overflow-hidden border border-[var(--th-edge-strong)] bg-[var(--th-raised)] p-1.5 shadow-[0_16px_48px_rgb(0_0_0/0.55)]"
      >
        {TOOL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.04]"
          >
            <ToolIcon tool={option.value} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">{option.label}</span>
              <span className="block truncate text-[11px] text-[var(--th-muted)]">
                {TOOL_DESCRIPTIONS[option.value]}
              </span>
            </span>
            {tool === option.value && (
              <Check className="size-3.5 shrink-0 text-[var(--th-accent-light)]" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSettingsInitialTab("session-defaults");
            setActivePage("settings");
          }}
          className="mt-1 flex w-full items-center gap-2 border-t border-[var(--th-edge)] px-2.5 pt-2.5 text-left text-[11px] text-[var(--th-muted)] hover:text-foreground"
        >
          <Settings className="size-3.5" />
          Per-kind defaults · Settings →
        </button>
      </PopoverContent>
    </Popover>
  );
}
