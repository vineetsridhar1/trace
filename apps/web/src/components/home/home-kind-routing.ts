import type { Repo } from "@trace/gql";

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

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
