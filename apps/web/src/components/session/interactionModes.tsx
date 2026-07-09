import { Pencil, Map, HelpCircle, type LucideIcon } from "lucide-react";
import { stripPromptWrapping, wrapPrompt, type InteractionMode } from "@trace/client-core";

export { stripPromptWrapping, wrapPrompt };
export type { InteractionMode };

export const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];

export interface ModeConfig {
  label: string;
  icon: LucideIcon;
  style: string;
  /** Border/ring class applied to the input textarea */
  inputBorder: string;
}

export const MODE_CONFIG: Record<InteractionMode, ModeConfig> = {
  code: {
    label: "Code",
    icon: Pencil,
    style: "border-transparent text-foreground",
    inputBorder: "border-border focus:ring-accent",
  },
  plan: {
    label: "Plan",
    icon: Map,
    style: "border-transparent text-violet-300",
    inputBorder: "border-violet-500/50 focus:ring-violet-500",
  },
  ask: {
    label: "Ask",
    icon: HelpCircle,
    style: "border-transparent text-orange-400",
    inputBorder: "border-orange-600/50 focus:ring-orange-600",
  },
};
