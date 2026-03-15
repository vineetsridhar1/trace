import { Pencil, Map, HelpCircle, type LucideIcon } from "lucide-react";

export type InteractionMode = "code" | "plan" | "ask";

export const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];

export interface ModeConfig {
  label: string;
  icon: LucideIcon;
  style: string;
}

export const MODE_CONFIG: Record<InteractionMode, ModeConfig> = {
  code: {
    label: "Code",
    icon: Pencil,
    style: "border-border bg-secondary text-foreground",
  },
  plan: {
    label: "Plan",
    icon: Map,
    style: "border-accent bg-accent/20 text-accent",
  },
  ask: {
    label: "Ask",
    icon: HelpCircle,
    style: "border-amber-500 bg-amber-500/20 text-amber-300",
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
