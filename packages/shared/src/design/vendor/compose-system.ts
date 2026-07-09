export type OpenDesignPromptKind = "design" | "app";

export type OpenDesignPromptInput = {
  kind: OpenDesignPromptKind;
  userBrief?: string | null;
  designSystemId?: string | null;
  skillIds?: string[] | null;
  artifactContext?: string | null;
  elementAnchors?: Array<Record<string, unknown>> | null;
  appStarterContext?: string | null;
};

function section(title: string, body: string | null | undefined): string | null {
  const trimmed = body?.trim();
  return trimmed ? `## ${title}\n${trimmed}` : null;
}

function listSection(title: string, values: string[] | null | undefined): string | null {
  const clean = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return clean.length ? `## ${title}\n${clean.map((value) => `- ${value}`).join("\n")}` : null;
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
    section("Artifact Context", input.artifactContext ?? null),
    input.elementAnchors?.length
      ? section("Selected Element Anchors", JSON.stringify(input.elementAnchors))
      : null,
    section("App Starter Context", input.appStarterContext ?? null),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}
