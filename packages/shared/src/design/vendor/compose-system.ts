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

function listSection(title: string, values: string[] | null | undefined): string | null {
  const clean = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return clean.length ? `## ${title}\n${clean.map((value) => `- ${value}`).join("\n")}` : null;
}

function designSystemSection(content: OpenDesignDesignSystemContent | null | undefined) {
  if (!content) return null;
  const parts = [
    content.name ? `Name: ${content.name}` : null,
    content.design ? `DESIGN.md:\n${content.design}` : null,
    content.tokensCss ? `tokens.css:\n${content.tokensCss}` : null,
    content.usage ? `USAGE.md:\n${content.usage}` : null,
    content.componentsManifest
      ? `components.manifest.json:\n${JSON.stringify(content.componentsManifest, null, 2)}`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? section(`Design System Content: ${content.id}`, parts.join("\n\n")) : null;
}

function skillContentSection(content: OpenDesignSkillContent[] | null | undefined) {
  const skills = (content ?? []).filter((skill) => skill.body.trim().length > 0);
  if (skills.length === 0) return null;
  return section(
    "Skill Content",
    skills
      .map((skill) =>
        [`### ${skill.title?.trim() || skill.id}`, skill.body.trim()].filter(Boolean).join("\n"),
      )
      .join("\n\n"),
  );
}

export function composeOpenDesignSystemPrompt(input: OpenDesignPromptInput): string {
  const charter =
    input.kind === "app"
      ? "You are Open Design for a full-stack product application. Translate the brief into a working, production-shaped app."
      : "You are Open Design for artifact generation. Translate the brief into a high-quality visual product design.";
  const outputContract =
    input.kind === "app"
      ? [
          "Work inside the existing project files and preserve the starter's conventions.",
          "Plan routes, components, data flow, and persistence seams before coding.",
          "Prefer complete, running product behavior over static mock screens.",
        ].join("\n")
      : [
          "Return one complete self-contained HTML document.",
          "Use strong visual hierarchy, accessible contrast, responsive layout, and realistic product content.",
          "Make the design direction concrete enough for engineering implementation.",
        ].join("\n");

  return [
    "# Open Design System Prompt",
    charter,
    "",
    section("Output Contract", outputContract),
    section("User Brief", input.userBrief ?? null),
    input.designSystemId ? section("Design System", input.designSystemId) : null,
    listSection("Skills", input.skillIds ?? null),
    designSystemSection(input.designSystem),
    skillContentSection(input.skills),
    section("Artifact Context", input.artifactContext ?? null),
    input.elementAnchors?.length
      ? section("Selected Element Anchors", JSON.stringify(input.elementAnchors))
      : null,
    section("App Starter Context", input.appStarterContext ?? null),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}
