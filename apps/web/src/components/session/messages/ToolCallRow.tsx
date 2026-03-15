import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { formatCommandLabel, formatTime, serializeUnknown } from "./utils";

interface ToolCallRowProps {
  name: string;
  input?: Record<string, unknown>;
  timestamp: string;
}

export function ToolCallRow({ name, input, timestamp }: ToolCallRowProps) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [open, input]);

  const normalizedName = name.toLowerCase();
  const isCommand = normalizedName === "bash" || normalizedName === "command";
  const command = isCommand && typeof input?.command === "string"
    ? formatCommandLabel(input.command)
    : null;
  const label = command ?? `${name} executed`;

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
        <code className="tool-cmd-code">{label}</code>
        <span className="tool-cmd-time">{formatTime(timestamp)}</span>
      </button>
      <div
        className="tool-cmd-body"
        style={{ maxHeight: open ? `${bodyHeight}px` : "0px" }}
      >
        <div ref={bodyRef}>
          {input && !command && (
            <pre className="tool-cmd-output">{serializeUnknown(input)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
