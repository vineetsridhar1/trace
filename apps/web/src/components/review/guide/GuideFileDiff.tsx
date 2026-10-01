import { useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewDiffFile } from "@trace/gql";
import { ExternalLink } from "lucide-react";
import { client } from "../../../lib/urql";
import { hunkGapLabel, parsePatch } from "../diff-patch";
import { DiffGapRow } from "../diff/DiffGapRow";
import { DiffLineRow } from "../diff/DiffLineRow";
import type { GuideAnchor } from "./guide-content";

const DIFF_QUERY = gql`
  query GuideDiffFile($snapshotId: ID!, $filePath: String!) {
    reviewDiffFile(snapshotId: $snapshotId, filePath: $filePath) {
      snapshotId
      path
      additions
      deletions
      patch
      truncated
    }
  }
`;

export function GuideFileDiff({
  snapshotId,
  filePath,
  highlight,
  onOpenInChanges,
}: {
  snapshotId: string;
  filePath: string;
  highlight: GuideAnchor | null;
  onOpenInChanges(): void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const highlightRowRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [diff, setDiff] = useState<ReviewDiffFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  // A Guide link can target a file far down the scroll, so load on demand rather than up front.
  useEffect(() => {
    if ((!visible && !highlight) || diff || error) return;
    let cancelled = false;
    void client
      .query(DIFF_QUERY, { snapshotId, filePath })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error) setError(result.error.message);
        else setDiff((result.data?.reviewDiffFile as ReviewDiffFile | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [diff, error, filePath, highlight, snapshotId, visible]);

  const lines = useMemo(() => parsePatch(diff?.patch ?? ""), [diff?.patch]);
  useEffect(() => {
    if (!highlight || lines.length === 0) return;
    highlightRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, lines.length]);

  const lastSlash = filePath.lastIndexOf("/");
  return (
    <div
      ref={cardRef}
      data-guide-file={filePath}
      className="min-w-0 overflow-clip rounded-[9px] border border-[var(--th-review-card-edge)] bg-[var(--th-review-card)]"
    >
      <header className="sticky top-0 z-[1] flex h-10 items-center gap-2.5 border-b border-[var(--th-review-card-edge)] bg-[var(--th-surface)] px-3.5">
        <span className="min-w-0 truncate font-mono text-[12.5px] text-muted-foreground">
          {lastSlash === -1 ? "" : filePath.slice(0, lastSlash + 1)}
          <span className="font-medium text-[var(--th-review-text)]">
            {filePath.slice(lastSlash + 1)}
          </span>
        </span>
        {diff ? (
          <span className="ml-auto shrink-0 font-mono text-[11.5px] font-medium">
            <span className="text-[var(--th-success)]">+{diff.additions}</span>{" "}
            <span className="text-[var(--destructive)]">&minus;{diff.deletions}</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpenInChanges}
          className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-[var(--th-review-comment)] hover:underline"
        >
          Open in Changes <ExternalLink size={9} />
        </button>
      </header>
      {error ? <p className="p-4 text-xs text-destructive">{error}</p> : null}
      {!error && !diff ? <div className="h-40 animate-pulse bg-muted/10" /> : null}
      {diff ? (
        <div className="native-scrollbar min-w-0 overflow-x-auto py-1 font-mono text-xs leading-5">
          <div className="min-w-max">
            {lines.map((line, index) => {
              if (line.kind === "meta") {
                const label = hunkGapLabel(line);
                return label ? <DiffGapRow key={index} label={label} position="between" /> : null;
              }
              const lineNumber = line.newLine ?? line.oldLine;
              const lit =
                !!highlight &&
                line.kind !== "delete" &&
                line.newLine != null &&
                line.newLine >= highlight.startLine &&
                line.newLine <= highlight.endLine;
              return (
                <DiffLineRow
                  key={index}
                  ref={lit && line.newLine === highlight.startLine ? highlightRowRef : null}
                  line={line}
                  emphasis={lit ? "selected" : "none"}
                  lineNumber={lineNumber}
                />
              );
            })}
          </div>
        </div>
      ) : null}
      {diff?.truncated ? <DiffGapRow label="diff truncated" position="end" /> : null}
    </div>
  );
}
