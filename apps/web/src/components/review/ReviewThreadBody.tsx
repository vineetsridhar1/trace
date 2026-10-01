/** Renders a comment body, styling `backticked` spans as the design's inline code chips. */
export function ReviewThreadBody({ body }: { body: string }) {
  return (
    <p className="m-0 text-[13px] leading-[1.55] text-[#d4d4d8]">
      {body.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <span
            key={index}
            className="rounded bg-[#111] px-1 py-px font-mono text-xs text-[#e4e4e7]"
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={index} className="whitespace-pre-wrap">
            {part}
          </span>
        ),
      )}
    </p>
  );
}
