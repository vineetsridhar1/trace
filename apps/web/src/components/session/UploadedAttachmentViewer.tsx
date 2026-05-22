import { useCallback, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { FileText, RefreshCw } from "lucide-react";
import { getAuthHeaders } from "@trace/client-core";
import { getLanguageFromPath } from "../../lib/monaco-utils";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function UploadedAttachmentViewer({
  attachmentKey,
  label,
}: {
  attachmentKey: string;
  label: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const urlResponse = await fetch(
        `${API_URL}/uploads/url?key=${encodeURIComponent(attachmentKey)}`,
        {
          credentials: "include",
          headers: getAuthHeaders(),
        },
      );
      const urlData = (await urlResponse.json()) as { url?: string };
      if (!urlData.url) throw new Error("Failed to load attachment URL");

      const fileResponse = await fetch(urlData.url);
      if (!fileResponse.ok) throw new Error("Failed to load attachment content");
      setContent(await fileResponse.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attachment");
    } finally {
      setLoading(false);
    }
  }, [attachmentKey]);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <TraceLoader size={20} showLabel={false} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#1e1e1e] px-4 text-center">
        <FileText size={24} className="text-muted-foreground" />
        <p className="text-sm text-red-400">Failed to load attachment</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void fetchContent()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2d2d2d] bg-[#252526] px-3">
        <div className="min-w-0 flex-1 truncate text-[11px] text-[#bbbbbb]">{label}</div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-[11px] text-[#858585]">Read-only attachment</div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => void fetchContent()}
            className="h-6 w-6 rounded border border-[#3c3c3c] text-[#cccccc] hover:bg-[#2f3030] hover:text-[#ffffff]"
            title="Refresh attachment"
          >
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={getLanguageFromPath(label)}
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
            wordWrap: "on",
            automaticLayout: true,
            padding: { top: 8 },
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
          loading={
            <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
              <TraceLoader size={20} showLabel={false} />
            </div>
          }
        />
      </div>
    </div>
  );
}
