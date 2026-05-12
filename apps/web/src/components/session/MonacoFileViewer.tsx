import { useCallback, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { gql } from "@urql/core";
import { Code2, Eye, Loader2, RefreshCw } from "lucide-react";
import { client } from "../../lib/urql";
import { getLanguageFromPath } from "../../lib/monaco-utils";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { getFileRenderViewer, type FileViewMode } from "./file-render-viewers";

const SESSION_GROUP_FILE_CONTENT_QUERY = gql`
  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {
    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)
  }
`;

export function MonacoFileViewer({
  sessionGroupId,
  filePath,
}: {
  sessionGroupId: string;
  filePath: string;
}) {
  const renderViewer = getFileRenderViewer(filePath);
  const [content, setContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<FileViewMode>(renderViewer?.defaultMode ?? "raw");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await client
          .query(SESSION_GROUP_FILE_CONTENT_QUERY, { sessionGroupId, filePath })
          .toPromise();
        if (result.error) {
          if (!silent) setError(result.error.message);
        } else {
          setContent(result.data?.sessionGroupFileContent ?? "");
          if (!silent) setError(null);
        }
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionGroupId, filePath],
  );

  // Initial fetch
  useEffect(() => {
    fetchContent(false);
  }, [fetchContent]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#1e1e1e] px-4 text-center">
        <p className="text-sm text-red-400">Failed to load file</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <button
          onClick={() => fetchContent(false)}
          className="mt-2 text-xs text-blue-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const language = getLanguageFromPath(filePath);
  const RenderedViewer = renderViewer?.Component;
  const showingRendered = viewMode === "rendered" && !!RenderedViewer;

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2d2d2d] bg-[#252526] px-2">
        <div className="min-w-0 flex-1 truncate px-1 text-[11px] text-[#bbbbbb]">{filePath}</div>
        <div className="flex shrink-0 items-center gap-1">
          {renderViewer && (
            <div className="flex items-center rounded-md border border-[#3c3c3c] bg-[#1e1e1e] p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={showingRendered}
                onClick={() => setViewMode("rendered")}
                className={cn(
                  "h-6 rounded px-2 text-[11px] text-[#bbbbbb] hover:bg-[#2f3030] hover:text-[#ffffff]",
                  showingRendered && "bg-[#3a3d41] text-[#ffffff]",
                )}
                title={`Render ${renderViewer.label}`}
              >
                <Eye size={12} />
                Render
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={!showingRendered}
                onClick={() => setViewMode("raw")}
                className={cn(
                  "h-6 rounded px-2 text-[11px] text-[#bbbbbb] hover:bg-[#2f3030] hover:text-[#ffffff]",
                  !showingRendered && "bg-[#3a3d41] text-[#ffffff]",
                )}
                title="Show raw text"
              >
                <Code2 size={12} />
                Raw
              </Button>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => fetchContent(false)}
            className="h-6 w-6 rounded border border-[#3c3c3c] text-[#cccccc] hover:bg-[#2f3030] hover:text-[#ffffff]"
            title="Refresh file"
          >
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {showingRendered && RenderedViewer ? (
          <RenderedViewer content={content ?? ""} filePath={filePath} />
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content ?? ""}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: "on",
              renderLineHighlight: "line",
              folding: true,
              wordWrap: "off",
              automaticLayout: true,
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
        )}
      </div>
    </div>
  );
}
