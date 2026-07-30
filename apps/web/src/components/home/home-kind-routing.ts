import type { Repo } from "@trace/gql";
import type { HomeCreatableKind } from "./home-kinds";

const KIND_PATTERNS: Array<{
  kind: HomeCreatableKind;
  patterns: RegExp[];
}> = [
  {
    kind: "animation",
    patterns: [/\banimat(?:e|ed|ion)\b/i, /\bmotion\b/i, /\blottie\b/i, /\bkeyframes?\b/i],
  },
  {
    kind: "pdf",
    patterns: [
      /\bpdf\b/i,
      /\breport\b/i,
      /\bproposal\b/i,
      /\bprint(?:able)?\b/i,
      /\bwhitepaper\b/i,
      /\bdocument\b/i,
    ],
  },
  {
    kind: "design",
    patterns: [
      /\bfigma\b/i,
      /\bwireframes?\b/i,
      /\bmockups?\b/i,
      /\buser flow\b/i,
      /\bvisual direction\b/i,
      /\bui design\b/i,
      /\bux\b/i,
    ],
  },
  {
    kind: "app",
    patterns: [
      /\b(app|application)\b/i,
      /\bwebsite\b/i,
      /\blanding page\b/i,
      /\bdashboard\b/i,
      /\bprototype\b/i,
      /\bfull[- ]stack\b/i,
    ],
  },
  {
    kind: "coding",
    patterns: [
      /\b(code|coding)\b/i,
      /\bimplement\b/i,
      /\brefactor\b/i,
      /\bdebug\b/i,
      /\bfix\b/i,
      /\btests?\b/i,
      /\bapi\b/i,
      /\bcomponent\b/i,
      /\brepository\b/i,
      /\brepo\b/i,
    ],
  },
];

export function detectHomeSessionKind(prompt: string): HomeCreatableKind | null {
  const normalized = prompt.trim();
  if (!normalized) return null;

  for (const candidate of KIND_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(normalized))) {
      return candidate.kind;
    }
  }

  return "coding";
}

export function detectPromptRepo(prompt: string, repos: Repo[]): Repo | null {
  const normalizedPrompt = normalizeSearchText(prompt);
  if (!normalizedPrompt) return null;

  return (
    [...repos]
      .sort((a, b) => b.name.length - a.name.length)
      .find((repo) => {
        const candidates = [
          repo.name,
          repo.remoteUrl
            ?.replace(/\.git$/i, "")
            .split("/")
            .pop() ?? "",
        ];
        return candidates.some((candidate) => {
          const normalizedCandidate = normalizeSearchText(candidate);
          return normalizedCandidate.length >= 3 && normalizedPrompt.includes(normalizedCandidate);
        });
      }) ?? null
  );
}

export function isSubstantialPromptEdit(original: string, next: string): boolean {
  const difference = Math.abs(original.trim().length - next.trim().length);
  return difference >= Math.max(12, Math.round(original.trim().length * 0.35));
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
