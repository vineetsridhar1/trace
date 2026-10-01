import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewDiffFile, ReviewDiffSide } from "@trace/gql";
import { MessageSquare, Sparkles } from "lucide-react";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";

const DIFF_QUERY = gql`
  query ReviewDiffFile($snapshotId: ID!, $filePath: String!) {
    reviewDiffFile(snapshotId: $snapshotId, filePath: $filePath) {
      snapshotId
      path
      previousPath
      status
      additions
      deletions
      patch
      originalContent
      modifiedContent
      truncated
    }
  }
`;

export interface ReviewLineSelection {
  filePath: string;
  side: ReviewDiffSide;
  startLine: number;
  endLine: number;
  selectedText: string;
  context: string;
}

interface DiffLine {
  kind: "add" | "delete" | "context" | "meta";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

interface ReviewDiffProps {
  snapshotId: string;
  filePath: string;
  requestedLine?: number | null;
  onComment(selection: ReviewLineSelection): void;
  onAsk(selection: ReviewLineSelection): void;
  onFileComment(filePath: string): void;
}

export function ReviewDiff({
  snapshotId,
  filePath,
  requestedLine,
  onComment,
  onAsk,
  onFileComment,
}: ReviewDiffProps) {
  const [file, setFile] = useState<ReviewDiffFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    side: ReviewDiffSide;
    start: number;
    end: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    void client
      .query(DIFF_QUERY, { snapshotId, filePath })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error) setError(result.error.message);
        else setFile(result.data?.reviewDiffFile ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, snapshotId]);
  const lines = useMemo(() => parsePatch(file?.patch ?? ""), [file?.patch]);
  const selection = selected ? selectionFromLines(filePath, lines, selected) : null;

  return (
    <section
      data-review-file={filePath}
      className="overflow-hidden rounded-lg border border-border bg-[#111318]"
    >
      <header className="sticky top-0 z-10 flex h-9 items-center justify-between border-b border-border bg-surface-deep/95 px-3 backdrop-blur">
        <span className="truncate font-mono text-xs text-foreground">{filePath}</span>
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {file ? `+${file.additions} −${file.deletions}` : "Loading…"}
          <button
            type="button"
            onClick={() => onFileComment(filePath)}
            className="rounded px-1.5 py-0.5 hover:bg-muted"
          >
            Comment on file
          </button>
        </span>
      </header>
      {error ? <p className="p-4 text-xs text-destructive">{error}</p> : null}
      {!error && !file ? <div className="h-48 animate-pulse bg-muted/20" /> : null}
      {file ? (
        <div className="overflow-x-auto font-mono text-[11px] leading-5">
          {lines.map((line, index) => {
            const side: ReviewDiffSide = line.kind === "delete" ? "base" : "head";
            const lineNumber = side === "base" ? line.oldLine : line.newLine;
            const active =
              !!selected &&
              selected.side === side &&
              lineNumber != null &&
              lineNumber >= selected.start &&
              lineNumber <= selected.end;
            const requested = requestedLine != null && lineNumber === requestedLine;
            return (
              <button
                key={`${index}:${line.oldLine}:${line.newLine}`}
                type="button"
                disabled={lineNumber == null}
                onClick={(event) => {
                  if (lineNumber == null) return;
                  setSelected((current) =>
                    event.shiftKey && current?.side === side
                      ? {
                          side,
                          start: Math.min(current.start, lineNumber),
                          end: Math.max(current.end, lineNumber),
                        }
                      : { side, start: lineNumber, end: lineNumber },
                  );
                }}
                className={`flex min-w-full text-left ${line.kind === "add" ? "bg-emerald-950/35" : line.kind === "delete" ? "bg-red-950/35" : line.kind === "meta" ? "bg-blue-950/30 text-blue-300" : ""} ${active || requested ? "ring-1 ring-inset ring-primary" : ""}`}
              >
                <span className="w-12 shrink-0 select-none border-r border-white/5 px-2 text-right text-white/25">
                  {line.oldLine ?? ""}
                </span>
                <span className="w-12 shrink-0 select-none border-r border-white/5 px-2 text-right text-white/25">
                  {line.newLine ?? ""}
                </span>
                <span className="w-5 shrink-0 select-none text-center text-white/35">
                  {line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " "}
                </span>
                <span className="whitespace-pre pr-4 text-white/80">{line.text || " "}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {selection ? (
        <div className="sticky bottom-2 ml-auto mr-2 flex w-fit gap-1 rounded-lg border border-border bg-surface-deep p-1 shadow-xl">
          <Button size="sm" variant="ghost" onClick={() => onComment(selection)}>
            <MessageSquare size={12} /> Comment for team
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAsk(selection)}>
            <Sparkles size={12} /> Ask AI
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const text of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: "meta", text, oldLine: null, newLine: null });
      continue;
    }
    if (text.startsWith("+") && !text.startsWith("+++")) {
      lines.push({ kind: "add", text: text.slice(1), oldLine: null, newLine: newLine++ });
      continue;
    }
    if (text.startsWith("-") && !text.startsWith("---")) {
      lines.push({ kind: "delete", text: text.slice(1), oldLine: oldLine++, newLine: null });
      continue;
    }
    if (text.startsWith(" ")) {
      lines.push({ kind: "context", text: text.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return lines;
}

function selectionFromLines(
  filePath: string,
  lines: DiffLine[],
  selected: { side: ReviewDiffSide; start: number; end: number },
): ReviewLineSelection {
  const relevant = lines.filter((line) => {
    const number = selected.side === "base" ? line.oldLine : line.newLine;
    return number != null && number >= selected.start && number <= selected.end;
  });
  const firstIndex = Math.max(0, lines.indexOf(relevant[0]!) - 3);
  const lastIndex = Math.min(lines.length, lines.indexOf(relevant.at(-1)!) + 4);
  return {
    filePath,
    side: selected.side,
    startLine: selected.start,
    endLine: selected.end,
    selectedText: relevant.map((line) => line.text).join("\n"),
    context: lines
      .slice(firstIndex, lastIndex)
      .map((line) => line.text)
      .join("\n"),
  };
}
