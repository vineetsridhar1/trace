import { useMemo } from "react";
import { diffLines } from "diff";

interface InlineDiffViewProps {
  oldString: string;
  newString: string;
  filePath?: string;
}

interface DiffLine {
  type: "context" | "removed" | "added";
  text: string;
}

function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const changes = diffLines(oldStr, newStr);
  const result: DiffLine[] = [];

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n");
    const type: DiffLine["type"] = change.added
      ? "added"
      : change.removed
        ? "removed"
        : "context";

    for (const text of lines) {
      result.push({ type, text });
    }
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
