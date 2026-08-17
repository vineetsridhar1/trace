import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { formatCommandLabel, formatTime, serializeUnknown } from "./utils";
import { InlineDiffView } from "./InlineDiffView";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";

export interface ToolCallRowProps {
  key?: React.Key;
  name: string;
  input?: Record<string, unknown>;
  output?: string | Record<string, unknown>;
  timestamp: string;
}

export function ToolCallRow({ name, input, output, timestamp }: ToolCallRowProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"input" | "output">("output");
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [open, input, output, tab]);

  // Default to output tab when output arrives
  useEffect(() => {
    if (output != null) setTab("output");
  }, [output]);

  const normalizedName = name.toLowerCase();
  const isCommand = normalizedName === "bash" || normalizedName === "command";
  const isEdit = normalizedName === "edit";
  const command =
    isCommand && typeof input?.command === "string" ? formatCommandLabel(input.command) : null;

  const hasEditDiff =
    isEdit && typeof input?.old_string === "string" && typeof input?.new_string === "string";

  const editFilePath =
    isEdit && typeof input?.file_path === "string" ? (input.file_path as string) : undefined;

  const label = command ?? `${name} executed`;

  // Show tabs when there's both input to display and output
  const showInput = !command && !hasEditDiff && input != null;
  const showTabs = showInput && output != null;
  const hasBodyContent = hasEditDiff || showInput || output != null;

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
        disabled={!hasBodyContent}
      >
        <span
          className="tool-cmd-chevron"
          style={{
            transform: open ? "rotate(90deg)" : undefined,
            visibility: hasBodyContent ? "visible" : "hidden",
          }}
        >
          <ChevronRight size={10} />
        </span>
        <code className="tool-cmd-code">{label}</code>
        <span className="tool-cmd-time">{formatTime(timestamp)}</span>
      </button>
      {hasBodyContent && (
        <div className="tool-cmd-body" style={{ maxHeight: open ? `${bodyHeight}px` : "0px" }}>
          <div ref={bodyRef}>
            {showTabs ? (
              <>
                <Tabs value={tab} onValueChange={(value) => setTab(value as "input" | "output")}>
                  <TabsList className="mb-2 h-7 rounded-md" aria-label="Tool call details">
                    <TabsTrigger value="output" className="px-2.5 text-xs">
                      Output
                    </TabsTrigger>
                    <TabsTrigger value="input" className="px-2.5 text-xs">
                      Input
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {tab === "input" ? (
                  <pre className="tool-cmd-output">{serializeUnknown(input)}</pre>
                ) : (
                  <pre className="tool-cmd-output">{serializeUnknown(output)}</pre>
                )}
              </>
            ) : (
              <>
                {hasEditDiff ? (
                  <InlineDiffView
                    oldString={input.old_string as string}
                    newString={input.new_string as string}
                    filePath={editFilePath}
                  />
                ) : (
                  showInput && <pre className="tool-cmd-output">{serializeUnknown(input)}</pre>
                )}
                {!showTabs && output != null && (
                  <pre className="tool-cmd-output">{serializeUnknown(output)}</pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
