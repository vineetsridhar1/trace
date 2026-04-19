import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { formatCommandLabel, formatTime, serializeUnknown } from "./utils";
import { InlineDiffView } from "./InlineDiffView";

export interface ToolCallRowProps {
  key?: React.Key;
  name: string;
  input?: Record<string, unknown>;
  output?: string | Record<string, unknown>;
  timestamp: string;
}

export function ToolCallRow({ name, input, output, timestamp }: ToolCallRowProps) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [open, input, output]);

  const normalizedName = name.toLowerCase();
  const isCommand = normalizedName === "bash" || normalizedName === "command";
  const isEdit = normalizedName === "edit";
  const command = isCommand && typeof input?.command === "string"
    ? formatCommandLabel(input.command)
    : null;

  const hasEditDiff = isEdit
    && typeof input?.old_string === "string"
    && typeof input?.new_string === "string";

  const editFilePath = isEdit && typeof input?.file_path === "string"
    ? input.file_path as string
    : undefined;

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
          {hasEditDiff ? (
            <InlineDiffView
              oldString={input.old_string as string}
              newString={input.new_string as string}
              filePath={editFilePath}
            />
          ) : (
            input && !command && (
              <>
                {output != null && <div className="tool-cmd-section-label">Input</div>}
                <pre className="tool-cmd-output">{serializeUnknown(input)}</pre>
              </>
            )
          )}
          {output != null && (
            <>
              <div className="tool-cmd-section-label">Output</div>
              <pre className="tool-cmd-output">{serializeUnknown(output)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
