import {
  composeOpenDesignSystemPrompt,
  type OpenDesignDesignSystemContent,
  type OpenDesignPromptKind,
  type OpenDesignSkillContent,
} from "./design/vendor/compose-system.js";
import { composeTraceOverlay } from "./design/trace-overlay.js";

export type TraceDesignPromptContent = {
  designSystem?: OpenDesignDesignSystemContent | null;
  skills?: OpenDesignSkillContent[] | null;
};

export type TraceDesignPromptInput = {
  kind?: OpenDesignPromptKind;
  userBrief?: string | null;
  artifactContext?: string | null;
  elementAnchors?: Array<Record<string, unknown>> | null;
  appStarterContext?: string | null;
  content?: TraceDesignPromptContent | null;
  designSystemId?: string | null;
  skillIds?: string[] | null;
};

export function composeTraceDesignPrompt(input: TraceDesignPromptInput = {}) {
  const normalized = {
    kind: input.kind ?? ("design" as const),
    userBrief: input.userBrief ?? null,
    designSystemId: input.designSystemId ?? null,
    skillIds: input.skillIds ?? null,
    designSystem: input.content?.designSystem ?? null,
    skills: input.content?.skills ?? null,
    artifactContext: input.artifactContext ?? null,
    elementAnchors: input.elementAnchors ?? null,
    appStarterContext: input.appStarterContext ?? null,
  };

  return [composeOpenDesignSystemPrompt(normalized), composeTraceOverlay(normalized)].join(
    "\n\n---\n\n",
  );
}
