import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { formatTime, serializeUnknown } from "./utils";

interface ToolResultRowProps {
  name: string;
  output?: string | Record<string, unknown>;
  timestamp: string;
}

export function ToolResultRow({ name, output, timestamp }: ToolResultRowProps) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [open, output]);

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
      >
        <span
          className="tool-cmd-chevron"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          <ChevronRight size={10} />
        </span>
        <code className="tool-cmd-code">{name} completed</code>
        <span className="tool-cmd-time">{formatTime(timestamp)}</span>
      </button>
      {output && (
        <div
          className="tool-cmd-body"
          style={{ maxHeight: open ? `${bodyHeight}px` : "0px" }}
        >
          <div ref={bodyRef}>
            <pre className="tool-cmd-output">{serializeUnknown(output)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
