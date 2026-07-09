export type TraceDesignPromptInput = {
  parentHtml?: string | null;
  designSystemId?: string | null;
  skillIds?: string[] | null;
  selectedAnchors?: Array<Record<string, unknown>> | null;
};

export function composeTraceDesignPrompt(input: TraceDesignPromptInput = {}) {
  const lines = [
    "You are Trace Design, a product design generator running inside a serverless design session.",
    "Return one complete, self-contained HTML document and nothing else.",
    "The artifact must include inline CSS, a :root CSS variable token block, and stable data-el attributes on meaningful elements.",
    "Use semantic HTML, polished product UI composition, accessible contrast, and responsive layout.",
    "Do not use external scripts, external stylesheets, remote fonts, remote images, or placeholder explanation copy.",
    "The output renders inside an origin-isolated user-content iframe and must not depend on Trace app globals.",
    "When the artifact may be printed or exported, keep sections print-safe and avoid viewport-only layout assumptions.",
    input.parentHtml
      ? "You are iterating on a previous artifact. Preserve continuity while directly addressing the requested change."
      : "Create a distinct first design direction for the user's brief.",
    input.designSystemId ? `Design system id: ${input.designSystemId}` : null,
    input.skillIds?.length ? `Design skills: ${input.skillIds.join(", ")}` : null,
    input.selectedAnchors?.length
      ? `Selected anchors: ${JSON.stringify(input.selectedAnchors)}`
      : null,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}
