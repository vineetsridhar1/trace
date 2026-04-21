import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { ReadGlobItem } from "@trace/client-core";
import { formatTime } from "./utils";

export type { ReadGlobItem };

interface ReadGlobGroupProps {
  items: ReadGlobItem[];
}

export function ReadGlobGroup({ items }: ReadGlobGroupProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  const first = items[0];
  const last = items[items.length - 1];

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
      >
        <motion.span
          className="read-group-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ChevronDown size={10} />
        </motion.span>
        <code className="tool-cmd-code opacity-60 font-light">
          {items.length} file scan{items.length !== 1 ? "s" : ""} (Read/Glob)
        </code>
        <span className="tool-cmd-time">
          {formatTime(first.timestamp)}
          {items.length > 1 && ` – ${formatTime(last.timestamp)}`}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.18 } }}
            style={{ overflow: "hidden" }}
          >
            <div className="space-y-0.5 py-1 max-h-[520px] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="read-group-subline">
                  <span className="font-semibold text-primary">
                    {item.toolName}
                  </span>
                  <span className="mx-2 text-muted-foreground">&middot;</span>
                  <span className="truncate text-muted-foreground">
                    {item.filePath}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
                    {formatTime(item.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
