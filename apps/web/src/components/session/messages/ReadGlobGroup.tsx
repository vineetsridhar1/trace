import { useState } from "react";
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
        <span className={`read-group-chevron ${open ? "open" : ""}`}>
          <ChevronDown size={10} />
        </span>
        <code className="tool-cmd-code opacity-60 font-light">
          {items.length} file scan{items.length !== 1 ? "s" : ""} (Read/Glob)
        </code>
        <span className="tool-cmd-time">
          {formatTime(first.timestamp)}
          {items.length > 1 && ` – ${formatTime(last.timestamp)}`}
        </span>
      </button>

      <div className={`read-group-body ${open ? "open" : ""}`}>
        <div className="space-y-0.5 py-1">
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
      </div>
    </div>
  );
}
