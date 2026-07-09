import { composeSystemPrompt } from "./prompts/system.js";

export type OpenDesignPromptKind = "design" | "app";

export type OpenDesignPromptInput = {
  kind: OpenDesignPromptKind;
  userBrief?: string | null;
  designSystemId?: string | null;
  skillIds?: string[] | null;
  designSystem?: OpenDesignDesignSystemContent | null;
  skills?: OpenDesignSkillContent[] | null;
  artifactContext?: string | null;
  elementAnchors?: Array<Record<string, unknown>> | null;
  appStarterContext?: string | null;
};

export type OpenDesignDesignSystemContent = {
  id: string;
  name?: string | null;
  manifest?: Record<string, unknown> | null;
  design?: string | null;
  tokensCss?: string | null;
  usage?: string | null;
  componentsManifest?: Record<string, unknown> | null;
};

export type OpenDesignSkillContent = {
  id: string;
  title?: string | null;
  body: string;
};

function section(title: string, body: string | null | undefined): string | null {
  const trimmed = body?.trim();
  return trimmed ? `## ${title}\n${trimmed}` : null;
}

function combineSkills(skills: OpenDesignSkillContent[] | null | undefined) {
  const clean = (skills ?? []).filter((skill) => skill.body.trim().length > 0);
  if (clean.length === 0) return undefined;
  return clean
    .map((skill) => [`# ${skill.title?.trim() || skill.id}`, skill.body.trim()].join("\n\n"))
    .join("\n\n---\n\n");
}

function promptInstructions(input: OpenDesignPromptInput) {
  return [
    section("Trace Session Kind", input.kind),
    section("User Brief", input.userBrief ?? null),
    section("Trace Design System Id", input.designSystemId ?? null),
    input.skillIds?.length ? section("Trace Skill Ids", input.skillIds.join(", ")) : null,
    section("Artifact Context", input.artifactContext ?? null),
    input.elementAnchors?.length
      ? section("Selected Element Anchors", JSON.stringify(input.elementAnchors))
      : null,
    section("App Starter Context", input.appStarterContext ?? null),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

export function composeOpenDesignSystemPrompt(input: OpenDesignPromptInput): string {
  const designSystem = input.designSystem ?? null;
  const componentsManifest = designSystem?.componentsManifest
    ? JSON.stringify(designSystem.componentsManifest, null, 2)
    : undefined;
  const prompt = composeSystemPrompt({
    agentId: "trace",
    includeCodexImagegenOverride: false,
    executionProfile: input.kind === "design" ? "text_artifact" : "filesystem",
    mediaExecution: { mode: "disabled" },
    metadata: {
      kind: input.kind === "design" ? "prototype" : "live-artifact",
      intent: input.kind === "design" ? "prototype" : "live-artifact",
      skipDiscoveryBrief: true,
    },
    skillBody: combineSkills(input.skills),
    skillName: input.skillIds?.filter(Boolean).join(", ") || undefined,
    skillMode: "prototype",
    designSystemBody: designSystem?.design ?? undefined,
    designSystemTitle: designSystem?.name ?? input.designSystemId ?? undefined,
    designSystemUsageMd: designSystem?.usage ?? undefined,
    designSystemTokensCss: designSystem?.tokensCss ?? undefined,
    designSystemComponentsManifest: componentsManifest,
    projectInstructions: promptInstructions(input),
    sessionMode: "design",
  });

  return ["# Open Design System Prompt", prompt].join("\n\n");
}
