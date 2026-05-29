import { useCallback, useEffect, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { gql } from "@urql/core";
import { Code2, Eye, GitCommitHorizontal, RefreshCw, Save } from "lucide-react";
import { client } from "../../lib/urql";
import { getLanguageFromPath } from "../../lib/monaco-utils";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import { getFileRenderViewer, type FileViewMode } from "./file-render-viewers";
import type { FileEditorBuffer } from "./file-editor-buffer";
import { toast } from "sonner";

const SESSION_GROUP_FILE_CONTENT_QUERY = gql`
  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {
    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)
  }
`;

const SAVE_SESSION_GROUP_FILE_MUTATION = gql`
  mutation SaveSessionGroupFile($sessionGroupId: ID!, $filePath: String!, $content: String!) {
    saveSessionGroupFile(sessionGroupId: $sessionGroupId, filePath: $filePath, content: $content)
  }
`;

const COMMIT_SESSION_GROUP_FILE_CHANGES_MUTATION = gql`
  mutation CommitSessionGroupFileChanges($sessionGroupId: ID!, $message: String) {
    commitSessionGroupFileChanges(sessionGroupId: $sessionGroupId, message: $message)
  }
`;

export function MonacoFileViewer({
  sessionGroupId,
  filePath,
  initialLineNumber,
  buffer,
  onBufferChange,
}: {
  sessionGroupId: string;
  filePath: string;
  initialLineNumber?: number;
  buffer?: FileEditorBuffer;
  onBufferChange?: (filePath: string, buffer: FileEditorBuffer) => void;
}) {
  const renderViewer = getFileRenderViewer(filePath);
  const defaultViewMode = renderViewer?.defaultMode ?? "raw";
  const [content, setContent] = useState<string | null>(() => buffer?.content ?? null);
  const [savedContent, setSavedContent] = useState<string | null>(
    () => buffer?.savedContent ?? null,
  );
  const [viewMode, setViewMode] = useState<FileViewMode>(defaultViewMode);
  const [loading, setLoading] = useState(!buffer);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeBuffer = useCallback(
    (nextContent: string, nextSavedContent: string) => {
      onBufferChange?.(filePath, { content: nextContent, savedContent: nextSavedContent });
    },
    [filePath, onBufferChange],
  );

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
          const nextContent = result.data?.sessionGroupFileContent ?? "";
          setContent(nextContent);
          setSavedContent(nextContent);
          storeBuffer(nextContent, nextContent);
          if (!silent) setError(null);
        }
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionGroupId, filePath, storeBuffer],
  );

  // Initial fetch
  useEffect(() => {
    if (buffer) {
      setLoading(false);
      setError(null);
      return;
    }
    fetchContent(false);
  }, [buffer, fetchContent]);

  useEffect(() => {
    setViewMode(defaultViewMode);
  }, [filePath, defaultViewMode]);

  const isDirty = content !== null && savedContent !== null && content !== savedContent;

  const saveCurrentContent = useCallback(async () => {
    if (!isDirty || content === null) return true;
    if (saving) return false;
    setSaving(true);
    try {
      const result = await client
        .mutation(SAVE_SESSION_GROUP_FILE_MUTATION, { sessionGroupId, filePath, content })
        .toPromise();
      if (result.error || result.data?.saveSessionGroupFile !== true) {
        throw new Error(result.error?.message ?? "Failed to save file");
      }
      setSavedContent(content);
      storeBuffer(content, content);
      toast.success("File saved");
      return true;
    } catch (err) {
      toast.error("Failed to save file", {
        description: err instanceof Error ? err.message : undefined,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [content, filePath, isDirty, saving, sessionGroupId, storeBuffer]);

  const handleSave = useCallback(async () => {
    await saveCurrentContent();
  }, [saveCurrentContent]);

  const handleCommit = useCallback(async () => {
    if (committing || saving) return;
    const message = window.prompt(
      "Commit message",
      `Update ${filePath.split("/").pop() ?? "files"}`,
    );
    if (message === null) return;
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    setCommitting(true);
    try {
      const saved = await saveCurrentContent();
      if (!saved) return;

      const result = await client
        .mutation(COMMIT_SESSION_GROUP_FILE_CHANGES_MUTATION, {
          sessionGroupId,
          message: trimmedMessage,
        })
        .toPromise();
      const commitSha = result.data?.commitSessionGroupFileChanges;
      if (result.error || typeof commitSha !== "string" || !commitSha) {
        throw new Error(result.error?.message ?? "Failed to commit changes");
      }
      toast.success("Changes committed", { description: commitSha.slice(0, 7) });
    } catch (err) {
      toast.error("Failed to commit changes", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCommitting(false);
    }
  }, [committing, filePath, saveCurrentContent, saving, sessionGroupId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void handleSave();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const handleEditorMount = useCallback<OnMount>(
    (editor) => {
      if (!initialLineNumber) return;
      editor.revealLineInCenter(initialLineNumber);
      editor.setPosition({ lineNumber: initialLineNumber, column: 1 });
    },
    [initialLineNumber],
  );

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
          {isDirty && (
            <span className="px-1 text-[11px] text-[#bbbbbb]">
              {saving ? "Saving..." : "Unsaved"}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!isDirty || saving}
            onClick={() => void handleSave()}
            className="h-6 rounded border border-[#3c3c3c] px-2 text-[11px] text-[#cccccc] hover:bg-[#2f3030] hover:text-[#ffffff] disabled:opacity-40"
            title="Save file"
          >
            <Save size={12} />
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={saving || committing}
            onClick={() => void handleCommit()}
            className="h-6 rounded border border-[#3c3c3c] px-2 text-[11px] text-[#cccccc] hover:bg-[#2f3030] hover:text-[#ffffff] disabled:opacity-40"
            title="Commit workspace changes"
          >
            <GitCommitHorizontal size={12} />
            {committing ? "Committing..." : "Commit"}
          </Button>
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
            onMount={handleEditorMount}
            onChange={(value) => {
              const nextContent = value ?? "";
              setContent(nextContent);
              if (savedContent !== null) {
                storeBuffer(nextContent, savedContent);
              }
            }}
            options={{
              readOnly: false,
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
                <TraceLoader size={20} showLabel={false} />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
