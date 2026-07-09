import {
  composeOpenDesignSystemPrompt,
  type OpenDesignPromptKind,
} from "./design/vendor/compose-system.js";
import { composeTraceOverlay } from "./design/trace-overlay.js";

export type TraceDesignPromptInput = {
  kind?: OpenDesignPromptKind;
  userBrief?: string | null;
  artifactContext?: string | null;
  elementAnchors?: Array<Record<string, unknown>> | null;
  appStarterContext?: string | null;
  parentHtml?: string | null;
  designSystemId?: string | null;
  skillIds?: string[] | null;
  selectedAnchors?: Array<Record<string, unknown>> | null;
};

export function composeTraceDesignPrompt(input: TraceDesignPromptInput = {}) {
  const normalized = {
    kind: input.kind ?? ("design" as const),
    userBrief: input.userBrief ?? null,
    designSystemId: input.designSystemId ?? null,
    skillIds: input.skillIds ?? null,
    artifactContext: input.artifactContext ?? input.parentHtml ?? null,
    elementAnchors: input.elementAnchors ?? input.selectedAnchors ?? null,
    appStarterContext: input.appStarterContext ?? null,
  };

  return [composeOpenDesignSystemPrompt(normalized), composeTraceOverlay(normalized)].join(
    "\n\n---\n\n",
  );
}
