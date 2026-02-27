import { memo } from 'react';

const MAX_LENGTH = 500;

export const AssistantTextRow = memo(function AssistantTextRow({
  text,
}: {
  text: string;
}) {
  const display = text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + '...' : text;

  return (
    <div className="px-1 py-0.5 text-[12px] leading-snug text-[#565f89] whitespace-pre-wrap break-words">
      {display}
    </div>
  );
});
