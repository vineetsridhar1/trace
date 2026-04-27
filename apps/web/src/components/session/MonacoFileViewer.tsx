import { useCallback, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { gql } from "@urql/core";
import { Loader2, RefreshCw } from "lucide-react";
import { client } from "../../lib/urql";
import { getLanguageFromPath } from "../../lib/monaco-utils";

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
  const [content, setContent] = useState<string | null>(null);
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

  return (
    <div className="relative h-full bg-[#1e1e1e]">
      <button
        type="button"
        onClick={() => fetchContent(false)}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded border border-[#3c3c3c] bg-[#252526] text-[#cccccc] transition-colors hover:bg-[#2f3030]"
        title="Refresh file"
      >
        <RefreshCw size={14} />
      </button>
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
    </div>
  );
}
