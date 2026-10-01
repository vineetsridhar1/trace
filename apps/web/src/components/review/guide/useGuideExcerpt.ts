import { useEffect, useRef, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewCodeExcerpt } from "@trace/gql";
import { client } from "../../../lib/urql";

const QUERY = gql`
  query GuideCodeExcerpt($snapshotId: ID!, $filePath: String!, $startLine: Int!, $endLine: Int!) {
    reviewCodeExcerpt(
      snapshotId: $snapshotId
      filePath: $filePath
      startLine: $startLine
      endLine: $endLine
    ) {
      snapshotId
      path
      startLine
      endLine
      content
      addedLines
    }
  }
`;

export function useGuideExcerpt(
  snapshotId: string,
  filePath: string,
  startLine: number,
  endLine: number,
  active: boolean,
) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const key = JSON.stringify([snapshotId, filePath, startLine, endLine]);
  const [result, setResult] = useState<{
    key: string;
    excerpt?: ReviewCodeExcerpt;
    error?: string;
  } | null>(null);
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (!cardRef.current || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if ((!visible && !active) || current) return;
    let cancelled = false;
    void client
      .query<{ reviewCodeExcerpt: ReviewCodeExcerpt }>(QUERY, {
        snapshotId,
        filePath,
        startLine,
        endLine,
      })
      .toPromise()
      .then((response) => {
        if (cancelled) return;
        setResult(
          response.data?.reviewCodeExcerpt && !response.error
            ? { key, excerpt: response.data.reviewCodeExcerpt }
            : { key, error: response.error?.message ?? "Code excerpt unavailable" },
        );
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({
            key,
            error: error instanceof Error ? error.message : "Code excerpt unavailable",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [active, visible, current, key, snapshotId, filePath, startLine, endLine]);

  return { cardRef, excerpt: current?.excerpt, error: current?.error };
}
