import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MAX_LENGTH = 500;

export const AssistantTextRow = memo(function AssistantTextRow({
  text,
}: {
  text: string;
}) {
  const display = text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + '...' : text;

  return (
    <div className="markdown-body px-1 py-1.5 text-[13px] leading-relaxed text-[#a9b1d6] break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{display}</ReactMarkdown>
    </div>
  );
});
