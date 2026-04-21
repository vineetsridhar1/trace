import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { formatCommandLabel, formatTime, serializeUnknown } from "./utils";

export interface ToolResultRowProps {
  key?: React.Key;
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
  const [open, setOpen] = useState(false);

  const label = commandResult ?? `${name} completed`;

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
      >
        <motion.span
          className="tool-cmd-chevron"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ChevronRight size={10} />
        </motion.span>
        <code className="tool-cmd-code">{label}</code>
        <span className="tool-cmd-time">{formatTime(timestamp)}</span>
      </button>
      <AnimatePresence initial={false}>
        {renderedOutput && open && (
          <motion.div
            key="body"
            className="tool-cmd-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.18 } }}
            style={{ overflow: "hidden" }}
          >
            <div>
              {commandResult && <div className="tool-cmd-section-label">Output</div>}
              <pre className="tool-cmd-output">{serializeUnknown(renderedOutput)}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
