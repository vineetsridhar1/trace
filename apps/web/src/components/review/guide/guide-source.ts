import type { GuideAnchor } from "./guide-content";

/** Link contextual files to immutable source, never the moving working branch. */
export function guideSourceUrl(
  pullRequestUrl: string,
  headSha: string,
  anchor: GuideAnchor,
): string | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+\/?$/.exec(pullRequestUrl);
  if (!match || !/^[a-f0-9]{40,64}$/i.test(headSha)) return null;
  const parts = anchor.filePath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  if (
    !Number.isSafeInteger(anchor.startLine) ||
    !Number.isSafeInteger(anchor.endLine) ||
    anchor.startLine < 1 ||
    anchor.endLine < anchor.startLine
  )
    return null;
  const path = parts.map(encodeURIComponent).join("/");
  const lines =
    anchor.startLine === anchor.endLine
      ? `L${anchor.startLine}`
      : `L${anchor.startLine}-L${anchor.endLine}`;
  return `https://github.com/${match[1]}/${match[2]}/blob/${headSha}/${path}#${lines}`;
}
