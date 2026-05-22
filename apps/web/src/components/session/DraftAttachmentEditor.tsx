import { useCallback, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { FileText } from "lucide-react";
import { getLanguageFromPath } from "../../lib/monaco-utils";
import { useDraftsStore } from "../../stores/drafts";
import { TraceLoader } from "../ui/trace-loader";

export function DraftAttachmentEditor({
  sessionId,
  attachmentId,
}: {
  sessionId: string;
  attachmentId: string;
}) {
  const attachment = useDraftsStore((s) =>
    s.drafts[sessionId]?.images.find((item) => item.id === attachmentId),
  );
  const setDraftImages = useDraftsStore((s) => s.setDraftImages);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const currentAttachment = useDraftsStore
      .getState()
      .drafts[sessionId]?.images.find((item) => item.id === attachmentId);

    setContent(null);
    setError(null);

    if (!currentAttachment) {
      setError("Attachment no longer exists.");
      return;
    }

    currentAttachment.file
      .text()
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load attachment.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentId, sessionId]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const nextContent = value ?? "";
      setContent(nextContent);
      setDraftImages(sessionId, (prev) =>
        prev.map((item) => {
          if (item.id !== attachmentId) return item;
          return {
            ...item,
            file: new File([nextContent], item.file.name || "attachment.txt", {
              type: item.file.type || "text/plain",
              lastModified: Date.now(),
            }),
          };
        }),
      );
    },
    [attachmentId, sessionId, setDraftImages],
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#1e1e1e] px-4 text-center">
        <FileText size={24} className="text-muted-foreground" />
        <p className="text-sm text-red-400">Failed to load attachment</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!attachment || content === null) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <TraceLoader size={20} showLabel={false} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex h-9 shrink-0 items-center border-b border-[#2d2d2d] bg-[#252526] px-3">
        <div className="min-w-0 flex-1 truncate text-[11px] text-[#bbbbbb]">
          {attachment.file.name || "Attachment"}
        </div>
        <div className="shrink-0 text-[11px] text-[#858585]">Draft attachment</div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={getLanguageFromPath(attachment.file.name)}
          value={content}
          theme="vs-dark"
          onChange={handleChange}
          options={{
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
