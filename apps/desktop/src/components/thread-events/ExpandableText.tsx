import { memo, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const ExpandableText = memo(function ExpandableText({
  text,
  lineClamp = 3,
}: {
  text: string;
  lineClamp?: number;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [needsClamp, setNeedsClamp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsedH, setCollapsedH] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const clampH = Math.ceil(lh * lineClamp);
    const scrollH = el.scrollHeight;
    if (scrollH > clampH + 4) {
      setNeedsClamp(true);
      setCollapsedH(clampH);
    } else {
      setNeedsClamp(false);
    }
  }, [text, lineClamp]);

  return (
    <div>
      <div
        style={{
          maxHeight: !needsClamp ? undefined : expanded ? undefined : `${collapsedH}px`,
          overflow: expanded ? undefined : 'hidden',
          transition: expanded ? undefined : 'max-height 0.3s ease',
        }}
      >
        <div ref={innerRef} className="markdown-body break-words text-sm text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      </div>
      {needsClamp && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 cursor-pointer text-xs font-medium text-accent-light hover:text-accent-light"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
});
