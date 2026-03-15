import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCommandLabel, formatTime, serializeUnknown } from "./utils";

const EXPLORATION_COMMANDS = new Set([
  "cat",
  "find",
  "git",
  "grep",
  "head",
  "ls",
  "pwd",
  "rg",
  "sed",
  "tail",
]);

function getCommandPrefix(command: string): string {
  const normalizedCommand = formatCommandLabel(command);
  const [binary = ""] = normalizedCommand.trim().split(/\s+/, 1);
  if (binary === "git") {
    if (/\bgit\s+(status|show|log|diff|branch)\b/.test(normalizedCommand)) return "Explored";
    return "Ran";
  }
  return EXPLORATION_COMMANDS.has(binary) ? "Explored" : "Ran";
}

interface CommandExecutionRowProps {
  command: string;
  output?: string | Record<string, unknown>;
  timestamp: string;
  exitCode?: number;
}

export function CommandExecutionRow({
  command,
  output,
  timestamp,
  exitCode,
}: CommandExecutionRowProps) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const prefix = getCommandPrefix(command);
  const displayCommand = formatCommandLabel(command);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [open, output, exitCode]);

  const renderedOutput = (() => {
    if (typeof output === "string" && output.trim()) return output;
    if (output && typeof output === "object" && Object.keys(output).length > 0) {
      return serializeUnknown(output);
    }
    if (exitCode != null && exitCode !== 0) return `Command exited with code ${exitCode}.`;
    return "";
  })();

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
        <span className="tool-cmd-prefix">{prefix}</span>
        <code className="tool-cmd-code">{displayCommand}</code>
        <span className="tool-cmd-time">{formatTime(timestamp)}</span>
      </button>
      {renderedOutput && (
        <div
          className="tool-cmd-body"
          style={{ maxHeight: open ? `${bodyHeight}px` : "0px" }}
        >
          <div ref={bodyRef}>
            <div className="tool-cmd-section-label">Output</div>
            <pre className="tool-cmd-output">{renderedOutput}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
