import { useMemo } from "react";
import { GuideCodeReference } from "./GuideCodeReference";
import { parseGuideExplanation } from "./guide-explanation";

export function GuideSnippetExplanation({
  text,
  snapshotId,
  filePath,
}: {
  text: string;
  snapshotId: string;
  filePath: string;
}) {
  const segments = useMemo(() => parseGuideExplanation(text, filePath), [text, filePath]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <GuideCodeReference
            key={index}
            snapshotId={snapshotId}
            label={segment.label}
            filePath={segment.anchor.filePath}
            startLine={segment.anchor.startLine}
            endLine={segment.anchor.endLine}
          />
        ),
      )}
    </>
  );
}
