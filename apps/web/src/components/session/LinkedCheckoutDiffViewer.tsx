import { DiffEditor } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { getLanguageFromPath } from "../../lib/monaco-utils";

interface LinkedCheckoutDiffViewerProps {
  file: DesktopLinkedCheckoutChangedFile | null;
}

export function LinkedCheckoutDiffViewer({ file }: LinkedCheckoutDiffViewerProps) {
  const content = useMemo(() => resolveDiffContent(file), [file]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e] px-4 text-center font-mono text-xs text-white/60">
        No diff preview available for this file.
      </div>
    );
  }

  return (
    <div className="h-full bg-[#1e1e1e]">
      <DiffEditor
        height="100%"
        language={getLanguageFromPath(file.path)}
        original={content.original}
        modified={content.modified}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          fontSize: 13,
          minimap: { enabled: false },
          padding: { top: 8 },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
        loading={
          <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        }
      />
    </div>
  );
}

function resolveDiffContent(file: DesktopLinkedCheckoutChangedFile | null): {
  original: string;
  modified: string;
} {
  if (!file) return { original: "", modified: "" };
  if (file.originalContent !== "" || file.modifiedContent !== "" || file.diff === "") {
    return {
      original: file.originalContent,
      modified: file.modifiedContent,
    };
  }

  return contentFromUnifiedDiff(file.diff);
}

function contentFromUnifiedDiff(diff: string): { original: string; modified: string } {
  const original: string[] = [];
  const modified: string[] = [];

  for (const line of diff.replace(/\n$/, "").split("\n")) {
    if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }

    if (line.startsWith("+")) {
      modified.push(line.slice(1));
      continue;
    }

    if (line.startsWith("-")) {
      original.push(line.slice(1));
      continue;
    }

    const context = line.startsWith(" ") ? line.slice(1) : line;
    original.push(context);
    modified.push(context);
  }

  return {
    original: original.join("\n"),
    modified: modified.join("\n"),
  };
}
