import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { useAuthStore, useEntityIds, useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { ArtifactGalleryCard } from "./ArtifactGalleryCard";
import { ArtifactViewerDialog } from "./ArtifactViewerDialog";

const ARTIFACTS_QUERY = gql`
  query GalleryArtifacts {
    artifacts {
      id
      organizationId
      sessionId
      type
      key
      bundleDigest
      byteSize
      createdAt
      manifest {
        schemaVersion
        files {
          path
          mediaType
          size
          digest
        }
      }
      session {
        id
        name
        sessionGroupId
      }
    }
  }
`;

export function ArtifactsGallery() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    void client
      .query(ARTIFACTS_QUERY, {}, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        if (result.error) return;
        const artifacts = result.data?.artifacts ?? [];
        upsertMany("artifacts", artifacts);
        upsertMany(
          "sessions",
          artifacts.map((artifact: { session: unknown }) => artifact.session),
        );
      });
  }, [activeOrgId, upsertMany]);

  const artifactIds = useEntityIds(
    "artifacts",
    (artifact) => artifact.organizationId === activeOrgId,
    (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="app-region-drag flex h-12 shrink-0 items-center border-b border-border py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
        <h2 className="text-sm font-semibold text-foreground">Artifacts</h2>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-foreground">Artifacts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Plans, images, and other files published by sessions in your workspace.
            </p>
          </div>
          {artifactIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Artifacts published by your sessions will appear here.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artifactIds.map((artifactId) => (
                <ArtifactGalleryCard
                  key={artifactId}
                  artifactId={artifactId}
                  onOpen={setOpenArtifactId}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <ArtifactViewerDialog
        artifactId={openArtifactId}
        onOpenChange={(open) => {
          if (!open) setOpenArtifactId(null);
        }}
      />
    </div>
  );
}
