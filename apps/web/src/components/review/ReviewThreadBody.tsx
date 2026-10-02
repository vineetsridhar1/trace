import { GuideSnippetExplanation } from "./guide/GuideSnippetExplanation";

/** Renders a comment body, styling `backticked` spans as the design's inline code chips. */
export function ReviewThreadBody({
  body,
  snapshotId,
  filePath,
}: {
  body: string;
  snapshotId?: string;
  filePath?: string;
}) {
  return (
    <p className="m-0 text-[13px] leading-[1.55] text-[var(--th-heading)]">
      {body.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <span
            key={index}
            className="rounded bg-[var(--th-surface-mid)] px-1 py-px font-mono text-xs text-[var(--th-review-text-mid)]"
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={index} className="whitespace-pre-wrap">
            {snapshotId && filePath ? (
              <GuideSnippetExplanation text={part} snapshotId={snapshotId} filePath={filePath} />
            ) : (
              part
            )}
          </span>
        ),
      )}
    </p>
  );
}
