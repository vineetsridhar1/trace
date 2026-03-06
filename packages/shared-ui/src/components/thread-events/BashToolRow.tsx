import { memo, useRef, useState, useEffect } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import type { ServerEvent } from '../../types';
import { serializeUnknown } from '../../utils';

export const BashToolRow = memo(function BashToolRow({
  event,
  time,
}: {
  event: ServerEvent;
  time: string;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  const input = event.toolInput as Record<string, unknown> | null;
  const command = typeof input?.command === 'string' ? input.command : null;
  const output = event.toolResponse ? serializeUnknown(event.toolResponse, 2000) : null;

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [output, open]);

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
      >
        <span className="tool-cmd-chevron" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
          <FiChevronRight size={10} />
        </span>
        <code className="tool-cmd-code">{command ?? `${event.toolName ?? 'Tool'} executed`}</code>
        <span className="tool-cmd-time">{time}</span>
      </button>
      <div
        className="tool-cmd-body"
        style={{ maxHeight: open ? `${bodyHeight}px` : '0px' }}
      >
        <div ref={bodyRef}>
          {output && (
            <pre className="tool-cmd-output">{output}</pre>
          )}
        </div>
      </div>
    </div>
  );
});
