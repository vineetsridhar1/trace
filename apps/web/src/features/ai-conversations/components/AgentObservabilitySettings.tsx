import { useCallback } from "react";
import { Settings, EyeOff, Eye, UserPlus } from "lucide-react";
import type { AgentObservability } from "@trace/gql";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useEntityField } from "@/stores/entity";
import { useUpdateAgentObservability } from "../hooks/useAiConversationMutations";

interface AgentObservabilitySettingsProps {
  conversationId: string;
}

const LEVELS: Array<{
  value: AgentObservability;
  label: string;
  description: string;
  icon: typeof EyeOff;
}> = [
  {
    value: "OFF",
    label: "Off",
    description: "Agent does not observe this conversation",
    icon: EyeOff,
  },
  {
    value: "SUGGEST",
    label: "Suggest",
    description: "Agent observes and may offer suggestions",
    icon: Eye,
  },
  {
    value: "PARTICIPATE",
    label: "Participate",
    description: "Agent observes and can post turns",
    icon: UserPlus,
  },
];

export function AgentObservabilitySettings({ conversationId }: AgentObservabilitySettingsProps) {
  const currentLevel = useEntityField("aiConversations", conversationId, "agentObservability");
  const updateObservability = useUpdateAgentObservability();

  const handleSelect = useCallback(
    (level: AgentObservability) => {
      if (level !== currentLevel) {
        updateObservability({ conversationId, level });
      }
    },
    [conversationId, currentLevel, updateObservability],
  );

  const activeLevel = LEVELS.find((l) => l.value === currentLevel) ?? LEVELS[0];
  const ActiveIcon = activeLevel.icon;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
          "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          "transition-colors cursor-pointer",
        )}
        title="Agent observability settings"
      >
        <Settings className="h-3.5 w-3.5" />
        <ActiveIcon className="h-3.5 w-3.5" />
      </PopoverTrigger>

      <PopoverContent side="bottom" align="end" className="w-72 p-1.5">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Agent Observability
        </div>

        <div className="flex flex-col gap-0.5">
          {LEVELS.map((level) => {
            const Icon = level.icon;
            const isActive = level.value === currentLevel;

            return (
              <button
                key={level.value}
                type="button"
                onClick={() => handleSelect(level.value)}
                className={cn(
                  "flex items-start gap-2.5 rounded-md px-2 py-1.5 text-left",
                  "transition-colors cursor-pointer",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{level.label}</div>
                  <div className="text-xs text-muted-foreground">{level.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
