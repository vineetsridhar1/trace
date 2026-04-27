import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { gql } from "@urql/core";
import { Loader2 } from "lucide-react";
import { client } from "../../lib/urql";
import { getLanguageFromPath } from "../../lib/monaco-utils";

const SESSION_GROUP_FILE_AT_REF_QUERY = gql`
  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {
    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)
  }
`;

const SESSION_GROUP_FILE_CONTENT_QUERY = gql`
  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {
    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)
  }
`;

interface MonacoDiffViewerProps {
  sessionGroupId: string;
  filePath: string;
  status: string;
  defaultBranch: string;
}

export function MonacoDiffViewer({
  sessionGroupId,
  filePath,
  status,
  defaultBranch,
}: MonacoDiffViewerProps) {
  const [original, setOriginal] = useState<string | null>(null);
  const [modified, setModified] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchOriginal =
      status === "A"
        ? Promise.resolve("")
        : client
            .query(SESSION_GROUP_FILE_AT_REF_QUERY, {
              sessionGroupId,
              filePath,
              ref: defaultBranch,
            })
            .toPromise()
            .then((r: { error?: unknown; data?: Record<string, unknown> }) => {
              if (r.error) return "";
              return (r.data?.sessionGroupFileAtRef as string) ?? "";
            });

    const fetchModified =
      status === "D"
        ? Promise.resolve("")
        : client
            .query(SESSION_GROUP_FILE_CONTENT_QUERY, {
              sessionGroupId,
              filePath,
            })
            .toPromise()
            .then((r: { error?: { message: string }; data?: Record<string, unknown> }) => {
              if (r.error) throw new Error(r.error.message);
              return (r.data?.sessionGroupFileContent as string) ?? "";
            });

    Promise.all([fetchOriginal, fetchModified])
      .then(([orig, mod]) => {
        if (cancelled) return;
        setOriginal(orig);
        setModified(mod);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load diff");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionGroupId, filePath, status, defaultBranch]);

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
        <p className="text-sm text-red-400">Failed to load diff</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  const language = getLanguageFromPath(filePath);

  return (
    <div className="h-full bg-[#1e1e1e]">
      <DiffEditor
        height="100%"
        language={language}
        original={original ?? ""}
        modified={modified ?? ""}
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
