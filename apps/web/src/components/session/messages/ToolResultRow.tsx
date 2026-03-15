import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { formatCommandLabel, formatTime, serializeUnknown } from "./utils";

interface ToolResultRowProps {
  name: string;
  output?: string | Record<string, unknown>;
  timestamp: string;
}

export function ToolResultRow({ name, output, timestamp }: ToolResultRowProps) {
  const commandResult = output && typeof output === "object" && typeof output.command === "string"
    ? formatCommandLabel(output.command)
    : null;
  let renderedOutput: string | Record<string, unknown> | undefined = output;
  if (output && typeof output === "object" && "output" in output) {
    const nestedOutput = output.output;
    if (typeof nestedOutput === "string") {
      renderedOutput = nestedOutput;
    } else if (nestedOutput && typeof nestedOutput === "object" && !Array.isArray(nestedOutput)) {
      renderedOutput = nestedOutput as Record<string, unknown>;
    } else {
      renderedOutput = undefined;
    }
  }
  const [open, setOpen] = useState(Boolean(commandResult && renderedOutput));
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [open, output]);

  const label = commandResult ?? `${name} completed`;

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
      {renderedOutput && (
        <div
          className="tool-cmd-body"
          style={{ maxHeight: open ? `${bodyHeight}px` : "0px" }}
        >
          <div ref={bodyRef}>
            {commandResult && <div className="tool-cmd-section-label">Output</div>}
            <pre className="tool-cmd-output">{serializeUnknown(renderedOutput)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
