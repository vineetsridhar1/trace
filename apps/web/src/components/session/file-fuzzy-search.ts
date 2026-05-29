export interface FileSearchResult {
  path: string;
  score: number;
}

function scoreToken(path: string, token: string, basenameStart: number): number {
  let searchIndex = 0;
  let firstMatch = -1;
  let previousMatch = -1;
  let contiguous = 0;
  let boundaryMatches = 0;

  for (let tokenIndex = 0; tokenIndex < token.length; tokenIndex++) {
    const char = token[tokenIndex];
    const matchIndex = path.indexOf(char, searchIndex);
    if (matchIndex === -1) return 0;
    if (firstMatch === -1) firstMatch = matchIndex;
    if (matchIndex === previousMatch + 1) contiguous += 1;
    if (matchIndex === 0 || "/._-".includes(path[matchIndex - 1] ?? "")) boundaryMatches += 1;
    previousMatch = matchIndex;
    searchIndex = matchIndex + 1;
  }

  const exactIndex = path.indexOf(token);
  const basename = path.slice(basenameStart);
  const basenameExactIndex = basename.indexOf(token);
  const compactness = token.length / Math.max(1, previousMatch - firstMatch + 1);
  let score = 0.2 + compactness * 0.25 + contiguous * 0.035 + boundaryMatches * 0.08;

  if (exactIndex !== -1) score += 0.25;
  if (path.startsWith(token)) score += 0.25;
  if (basename.startsWith(token)) score += 0.35;
  if (basenameExactIndex !== -1) score += 0.18;
  score += Math.max(0, 0.12 - firstMatch / 600);

  return Math.min(score, 1);
}

export function scoreFilePath(path: string, query: string): number {
  const normalizedQuery = query.trim().toLowerCase().replace(/\\/g, "/");
  if (!normalizedQuery) return 1;

  const normalizedPath = path.toLowerCase().replace(/\\/g, "/");
  const basenameStart = normalizedPath.lastIndexOf("/") + 1;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  let score = 0;
  for (const token of tokens) {
    const tokenScore = scoreToken(normalizedPath, token, basenameStart);
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }

  return score / tokens.length;
}

export function searchFilePaths(files: string[], query: string, limit: number): FileSearchResult[] {
  const results: FileSearchResult[] = [];

  for (const path of files) {
    const score = scoreFilePath(path, query);
    if (score > 0) results.push({ path, score });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  return results.slice(0, limit);
}
