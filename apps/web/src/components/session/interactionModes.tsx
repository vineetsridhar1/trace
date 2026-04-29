import { Pencil, Map, HelpCircle, Workflow, type LucideIcon } from "lucide-react";
import {
  stripPromptWrapping,
  wrapPrompt as wrapCorePrompt,
  type InteractionMode as CoreInteractionMode,
} from "@trace/client-core";

export { stripPromptWrapping };

export type InteractionMode = CoreInteractionMode | "ultraplan";

export function wrapPrompt(mode: InteractionMode, prompt: string): string {
  return mode === "ultraplan" ? prompt : wrapCorePrompt(mode, prompt);
}

export const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask", "ultraplan"];

export interface ModeConfig {
  label: string;
  icon: LucideIcon;
  style: string;
  /** Border/ring class applied to the input textarea */
  inputBorder: string;
  /** Classes for the send button */
  sendButton: string;
  /** Color class for the runtime icon */
  iconColor: string;
  /** Border class for the outer input container */
  containerBorder: string;
}

export const MODE_CONFIG: Record<InteractionMode, ModeConfig> = {
  code: {
    label: "Code",
    icon: Pencil,
    style: "border-border bg-secondary text-foreground",
    inputBorder: "border-border focus:ring-accent",
    sendButton: "bg-accent hover:bg-accent/90 text-accent-foreground",
    iconColor: "text-accent",
    containerBorder: "border-border",
  },
  plan: {
    label: "Plan",
    icon: Map,
    style: "border-violet-500 bg-violet-500/20 text-violet-300",
    inputBorder: "border-violet-500/50 focus:ring-violet-500",
    sendButton: "bg-violet-500 hover:bg-violet-500/90 text-white",
    iconColor: "text-violet-400",
    containerBorder: "border-violet-500/50",
  },
  ask: {
    label: "Ask",
    icon: HelpCircle,
    style: "border-orange-600 bg-orange-600/20 text-orange-400",
    inputBorder: "border-orange-600/50 focus:ring-orange-600",
    sendButton: "bg-orange-600 hover:bg-orange-600/90 text-white",
    iconColor: "text-orange-400",
    containerBorder: "border-orange-600/50",
  },
  ultraplan: {
    label: "Ultraplan",
    icon: Workflow,
    style: "border-cyan-500 bg-cyan-500/20 text-cyan-300",
    inputBorder: "border-cyan-500/50 focus:ring-cyan-500",
    sendButton: "bg-cyan-500 hover:bg-cyan-500/90 text-white",
    iconColor: "text-cyan-400",
    containerBorder: "border-cyan-500/50",
  },
};
