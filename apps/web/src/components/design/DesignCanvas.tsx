import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import type { Artifact } from "@trace/gql";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";

const DESIGN_ARTIFACTS_QUERY = gql`
  query DesignArtifacts($sessionGroupId: ID!) {
    designArtifacts(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      parentArtifactId
      prompt
      title
      contentType
      html
      metadata
      publishedAt
      createdAt
      updatedAt
      createdBy {
        id
        name
        avatarUrl
      }
    }
  }
`;

const CREATE_DESIGN_ARTIFACT_MUTATION = gql`
  mutation CreateDesignArtifact($sessionGroupId: ID!, $prompt: String!) {
    createDesignArtifact(sessionGroupId: $sessionGroupId, prompt: $prompt) {
      id
      sessionGroupId
      parentArtifactId
      prompt
      title
      contentType
      html
      metadata
      publishedAt
      createdAt
      updatedAt
      createdBy {
        id
        name
        avatarUrl
      }
    }
  }
`;

type ArtifactResult = {
  designArtifacts?: Artifact[];
};

type CreateArtifactResult = {
  createDesignArtifact?: Artifact;
};

function ArtifactCard({ artifact, selected }: { artifact: Artifact; selected: boolean }) {
  return (
    <article
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-sm",
        selected ? "border-primary" : "border-border",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 truncate text-sm font-medium">{artifact.title}</div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {new Date(artifact.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
      <iframe
        title={artifact.title}
        srcDoc={artifact.html}
        sandbox="allow-scripts"
        className="h-[460px] w-full bg-white"
      />
    </article>
  );
}

export function DesignCanvas({ sessionGroupId }: { sessionGroupId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0] ?? null,
    [artifacts, selectedArtifactId],
  );

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    const result = await client
      .query<ArtifactResult>(DESIGN_ARTIFACTS_QUERY, { sessionGroupId })
      .toPromise();
    setArtifacts(result.data?.designArtifacts ?? []);
    setLoading(false);
  }, [sessionGroupId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const createArtifact = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    const result = await client
      .mutation<CreateArtifactResult>(CREATE_DESIGN_ARTIFACT_MUTATION, {
        sessionGroupId,
        prompt: trimmed,
      })
      .toPromise();
    const artifact = result.data?.createDesignArtifact;
    if (artifact) {
      setArtifacts((current) => [...current, artifact]);
      setSelectedArtifactId(artifact.id);
      setPrompt("");
    }
    setCreating(false);
  }, [creating, prompt, sessionGroupId]);

  return (
    <div className="flex h-full min-h-0 bg-surface-deep">
      <aside className="flex w-[320px] shrink-0 flex-col border-r bg-background">
        <div className="border-b p-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe another direction"
            className="min-h-24 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={createArtifact}
              disabled={!prompt.trim() || creating}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Option
            </button>
            <button
              type="button"
              onClick={loadArtifacts}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
              aria-label="Refresh artifacts"
              title="Refresh artifacts"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => setSelectedArtifactId(artifact.id)}
              className={cn(
                "mb-2 block w-full rounded-md border px-3 py-2 text-left text-sm",
                selectedArtifact?.id === artifact.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-surface-elevated",
              )}
            >
              <div className="truncate font-medium">{artifact.title}</div>
              <div className="truncate text-xs text-muted-foreground">{artifact.prompt}</div>
            </button>
          ))}
        </div>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={16} className="mr-2 animate-spin" />
            Loading artifacts
          </div>
        ) : selectedArtifact ? (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 xl:grid-cols-2">
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                selected={selectedArtifact.id === artifact.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No artifacts yet.
          </div>
        )}
      </main>
    </div>
  );
}
