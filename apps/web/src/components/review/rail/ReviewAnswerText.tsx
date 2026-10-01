/**
 * Answers come back as prose from the attached session. The design renders `backticked` names as
 * code chips and `path:line` mentions as links back into the diff, so the answer stays navigable.
 */
const SEGMENT_PATTERN = /(`[^`]+`)|([\w./-]+\.[a-zA-Z]{1,5}:\d+(?:-\d+)?)/g;

export function ReviewAnswerText({
  text,
  onOpenReference,
}: {
  text: string;
  onOpenReference(filePath: string, startLine: number): void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SEGMENT_PATTERN)) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const [whole, code, reference] = match;
    if (code) {
      parts.push(
        <span
          key={match.index}
          className="rounded bg-white/[0.06] px-1 py-px font-mono text-xs text-[#e4e4e7]"
        >
          {code.slice(1, -1)}
        </span>,
      );
    } else if (reference) {
      const [filePath, lines] = reference.split(":");
      parts.push(
        <button
          key={match.index}
          type="button"
          onClick={() => onOpenReference(filePath!, Number(lines!.split("-")[0]))}
          className="rounded bg-[#3b82f6]/10 px-[5px] py-px font-mono text-xs font-medium text-[#93c5fd] hover:bg-[#3b82f6]/20"
        >
          {reference}
        </button>,
      );
    }
    cursor = match.index + whole.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.65] text-[#d4d4d8]">{parts}</p>
  );
}
