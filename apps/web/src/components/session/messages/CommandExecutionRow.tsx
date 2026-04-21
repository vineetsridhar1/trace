import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import {
  formatCommandLabel,
  formatTime,
  getCommandPrefix,
  serializeUnknown,
} from "./utils";

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
  const prefix = getCommandPrefix(command);
  const displayCommand = formatCommandLabel(command);

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
        <motion.span
          className="tool-cmd-chevron"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ChevronRight size={10} />
        </motion.span>
        <span className="tool-cmd-prefix">{prefix}</span>
        <code className="tool-cmd-code">{displayCommand}</code>
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
              <div className="tool-cmd-section-label">Output</div>
              <pre className="tool-cmd-output">{renderedOutput}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
