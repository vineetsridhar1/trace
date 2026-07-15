export interface SessionStarterPrompt {
  label: string;
  prompt: string;
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

export function getSessionEmptyStateContent(
  kind: string | null | undefined,
): SessionEmptyStateContent {
  if (kind === "app") return APP_EMPTY_STATE;
  if (kind === "design") return DESIGN_EMPTY_STATE;
  return CODING_EMPTY_STATE;
}

export function isGeneratedProjectKind(kind: string | null | undefined): boolean {
  return kind === "app" || kind === "design";
}
