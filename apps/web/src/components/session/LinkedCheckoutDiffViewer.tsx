import { DiffEditor } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getLanguageFromPath } from "../../lib/monaco-utils";
import { queryLinkedCheckoutChangedFile } from "../../stores/linked-checkout";

interface LinkedCheckoutDiffViewerProps {
  file: DesktopLinkedCheckoutChangedFile | null;
  repoId: string | null | undefined;
  sessionGroupId: string;
  runtimeInstanceId: string | null;
}

const previewCache = new Map<string, DesktopLinkedCheckoutChangedFile>();

export function LinkedCheckoutDiffViewer({
  file,
  repoId,
  sessionGroupId,
  runtimeInstanceId,
}: LinkedCheckoutDiffViewerProps) {
  const cacheKey =
    file && repoId && runtimeInstanceId
      ? `${runtimeInstanceId}:${repoId}:${sessionGroupId}:${file.path}`
      : null;
  const [previewFile, setPreviewFile] = useState<DesktopLinkedCheckoutChangedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayFile = previewFile ?? file;
  const content = useMemo(() => resolveDiffContent(displayFile), [displayFile]);

  useEffect(() => {
    if (!file || !repoId || !runtimeInstanceId || !cacheKey) {
      setPreviewFile(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPreviewFile(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setPreviewFile(null);
    setLoading(true);
    setError(null);

    queryLinkedCheckoutChangedFile(sessionGroupId, repoId, runtimeInstanceId, file.path)
      .then((preview) => {
        previewCache.set(cacheKey, preview);
        if (!cancelled) setPreviewFile(preview);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, file, repoId, runtimeInstanceId, sessionGroupId]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e] px-4 text-center font-mono text-xs text-white/60">
        No diff preview available for this file.
      </div>
    );
  }

  if (loading && !previewFile) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && content.original === "" && content.modified === "") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#1e1e1e] px-4 text-center">
        <p className="text-sm text-red-400">Failed to load diff</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#1e1e1e]">
      <DiffEditor
        height="100%"
        language={getLanguageFromPath(displayFile?.path ?? file.path)}
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
          hideUnchangedRegions: {
            enabled: true,
            contextLineCount: 4,
            minimumLineCount: 12,
          },
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

  return contentFromUnifiedDiff(file.diff, file.path);
}

function contentFromUnifiedDiff(
  diff: string,
  filePath: string,
): { original: string; modified: string } {
  const original: string[] = [];
  const modified: string[] = [];
  let oldCursor: number | null = null;
  let newCursor: number | null = null;

  for (const line of diff.replace(/\n$/, "").split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      const oldStart = Number.parseInt(hunk[1] ?? "0", 10);
      const newStart = Number.parseInt(hunk[2] ?? "0", 10);
      if (oldCursor !== null && newCursor !== null) {
        const hiddenLines = Math.max(oldStart - oldCursor, newStart - newCursor);
        if (hiddenLines > 0) {
          const marker = hiddenLinesMarker(filePath, hiddenLines);
          original.push(marker);
          modified.push(marker);
        }
      }
      oldCursor = oldStart;
      newCursor = newStart;
      continue;
    }

    if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }

    if (line.startsWith("+")) {
      modified.push(line.slice(1));
      newCursor = (newCursor ?? 0) + 1;
      continue;
    }

    if (line.startsWith("-")) {
      original.push(line.slice(1));
      oldCursor = (oldCursor ?? 0) + 1;
      continue;
    }

    const context = line.startsWith(" ") ? line.slice(1) : line;
    original.push(context);
    modified.push(context);
    oldCursor = (oldCursor ?? 0) + 1;
    newCursor = (newCursor ?? 0) + 1;
  }

  return {
    original: original.join("\n"),
    modified: modified.join("\n"),
  };
}

function hiddenLinesMarker(filePath: string, hiddenLines: number): string {
  const label = `${hiddenLines} unchanged ${hiddenLines === 1 ? "line" : "lines"} hidden`;
  const extension = filePath.toLowerCase().split(".").pop() ?? "";

  if (["py", "rb", "sh", "bash", "zsh", "yml", "yaml", "toml"].includes(extension)) {
    return `# ... ${label} ...`;
  }

  if (["html", "md", "mdx", "xml", "svg"].includes(extension)) {
    return `<!-- ... ${label} ... -->`;
  }

  if (["css", "scss", "sass"].includes(extension)) {
    return `/* ... ${label} ... */`;
  }

  return `// ... ${label} ...`;
}
