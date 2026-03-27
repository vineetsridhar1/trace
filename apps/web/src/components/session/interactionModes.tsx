import { Pencil, Map, HelpCircle, type LucideIcon } from "lucide-react";

export type InteractionMode = "code" | "plan" | "ask";

export const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];

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
};

const PLAN_PREFIX = "Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.";

export function wrapPrompt(mode: InteractionMode, prompt: string): string {
  switch (mode) {
    case "plan":
      return `${PLAN_PREFIX}\n\n${prompt}`;
    case "ask":
      return `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${prompt}`;
    case "code":
    default:
      return prompt;
  }
}

const TRACE_INTERNAL_RE = /<trace-internal>[\s\S]*?<\/trace-internal>\s*/g;
const CONVERSATION_HISTORY_RE = /<conversation-history>[\s\S]*?<\/conversation-history>\s*/g;

export function stripPromptWrapping(text: string): string {
  let cleaned = text.replace(TRACE_INTERNAL_RE, "");
  cleaned = cleaned.replace(CONVERSATION_HISTORY_RE, "");
  if (cleaned.startsWith(PLAN_PREFIX)) {
    cleaned = cleaned.slice(PLAN_PREFIX.length);
  }
  return cleaned.trim();
}
