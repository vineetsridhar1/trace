import { useMemo } from "react";

interface InlineDiffViewProps {
  oldString: string;
  newString: string;
  filePath?: string;
}

interface DiffLine {
  type: "context" | "removed" | "added";
  text: string;
}

/**
 * Simple line-based diff: removed lines, then added lines, with surrounding context.
 * Uses a basic LCS approach to produce a minimal diff.
 */
function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "context", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", text: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "removed", text: oldLines[i - 1] });
      i--;
    }
  }

  // Reverse since we built it backwards
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }

  return result;
}

export function InlineDiffView({ oldString, newString, filePath }: InlineDiffViewProps) {
  const lines = useMemo(() => computeDiff(oldString, newString), [oldString, newString]);

  return (
    <div className="inline-diff-view">
      {filePath && (
        <div className="inline-diff-filepath">{filePath}</div>
      )}
      <div className="inline-diff-lines">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`inline-diff-line inline-diff-${line.type}`}
          >
            <span className="inline-diff-marker">
              {line.type === "removed" ? "−" : line.type === "added" ? "+" : " "}
            </span>
            <span className="inline-diff-text">{line.text || "\u00A0"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
