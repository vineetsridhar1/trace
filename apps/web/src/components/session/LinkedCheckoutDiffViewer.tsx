import { DiffEditor } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import { getLanguageFromPath } from "../../lib/monaco-utils";

interface LinkedCheckoutDiffViewerProps {
  file: DesktopLinkedCheckoutChangedFile | null;
}

export function LinkedCheckoutDiffViewer({ file }: LinkedCheckoutDiffViewerProps) {
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
        original={file.originalContent}
        modified={file.modifiedContent}
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
