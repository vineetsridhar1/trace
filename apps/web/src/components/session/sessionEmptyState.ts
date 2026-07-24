export type SessionStarterAction = "pick-design";

export interface SessionStarterPrompt {
  label: string;
  prompt: string;
  /**
   * When set, clicking the box opens an in-app flow instead of prefilling the
   * composer with `prompt`. "pick-design" opens the design picker to attach a
   * design for the agent to implement.
   */
  action?: SessionStarterAction;
}

export interface SessionEmptyStateContent {
  title: string;
  description: string;
  placeholder: string;
  starterPrompts: SessionStarterPrompt[];
  sendStarterImmediately: boolean;
}

const CODING_EMPTY_STATE: SessionEmptyStateContent = {
  title: "What should the agent do?",
  description: "Start with a suggestion, or type your own below.",
  placeholder: "What should the agent work on?",
  sendStarterImmediately: true,
  starterPrompts: [
    {
      label: "Implement a design",
      prompt: "",
      action: "pick-design",
    },
    {
      label: "Explain this codebase",
      prompt: "Give me a high-level tour of how this codebase is organized.",
    },
    {
      label: "Summarize recent changes",
      prompt: "Summarize the most recent changes on this branch.",
    },
    {
      label: "Review the latest commit",
      prompt: "Review the latest commit and flag anything risky.",
    },
  ],
};

const APP_EMPTY_STATE: SessionEmptyStateContent = {
  title: "What should we build?",
  description: "Describe your app, paste a reference image, or start with an idea below.",
  placeholder: "Describe the app you want to build…",
  sendStarterImmediately: false,
  starterPrompts: [
    {
      label: "Implement a design",
      prompt: "",
      action: "pick-design",
    },
    {
      label: "Create an operations dashboard",
      prompt:
        "Build an operations dashboard with key metrics, filters, a searchable data table, and clear drill-down states.",
    },
    {
      label: "Build an internal workflow",
      prompt:
        "Build an internal workflow tool with a queue, detailed record view, assignment, status changes, and activity history.",
    },
    {
      label: "Prototype a customer portal",
      prompt:
        "Build a customer portal with an overview, account settings, billing history, and a support request flow.",
    },
  ],
};

const DESIGN_EMPTY_STATE: SessionEmptyStateContent = {
  title: "What should we design?",
  description: "Describe a flow, paste visual references, or choose a starting point below.",
  placeholder: "Describe the screens, states, or variations to explore…",
  sendStarterImmediately: false,
  starterPrompts: [
    {
      label: "Design a mobile onboarding flow",
      prompt:
        "Design a polished mobile onboarding flow with welcome, account setup, personalization, permissions, and completion screens.",
    },
    {
      label: "Explore three landing-page directions",
      prompt:
        "Create three distinct visual directions for a responsive product landing page, including desktop and mobile artboards.",
    },
    {
      label: "Create a responsive dashboard",
      prompt:
        "Design a responsive analytics dashboard with overview, filtering, detail, loading, empty, and error states.",
    },
  ],
};

const PDF_EMPTY_STATE: SessionEmptyStateContent = {
  title: "What should we put in the PDF?",
  description: "Describe the document, add content or references, or choose a starting point below.",
  placeholder: "Describe the PDF you want to create…",
  sendStarterImmediately: false,
  starterPrompts: [
    { label: "Create a project proposal", prompt: "Create a polished, print-ready project proposal with an executive summary, scope, timeline, and next steps." },
    { label: "Make a client report", prompt: "Create a concise, professional client report with a cover page, findings, recommendations, and an appendix." },
    { label: "Design an event flyer", prompt: "Create a bold, one-page event flyer with clear hierarchy, essential event details, and a memorable visual direction." },
  ],
};

export function getSessionEmptyStateContent(
  kind: string | null | undefined,
): SessionEmptyStateContent {
  if (kind === "app") return APP_EMPTY_STATE;
  if (kind === "design") return DESIGN_EMPTY_STATE;
  if (kind === "pdf") return PDF_EMPTY_STATE;
  return CODING_EMPTY_STATE;
}

export function isGeneratedProjectKind(kind: string | null | undefined): boolean {
  return kind === "app" || kind === "design" || kind === "pdf";
}
