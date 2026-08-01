import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { ArrowLeft } from "lucide-react";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
} from "../ui/responsive-dialog";
import { artifactDisplay } from "./artifact-display";
import { ArtifactContent } from "./ArtifactContent";
import { ArtifactGalleryCard } from "./ArtifactGalleryCard";

const GROUP_ARTIFACTS_QUERY = gql`
  query SessionGroupArtifacts($sessionGroupId: ID!) {
    artifacts(sessionGroupId: $sessionGroupId) {
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

export function SessionGroupArtifactsDialog({
  sessionGroupId,
  open,
  onOpenChange,
}: {
  sessionGroupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const artifactTable = useEntityStore((state) => state.artifacts);
  const sessionTable = useEntityStore((state) => state.sessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    void client
      .query(GROUP_ARTIFACTS_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        if (result.error) return;
        upsertMany("artifacts", result.data?.artifacts ?? []);
      });
  }, [open, sessionGroupId, upsertMany]);

  const groupSessionIds = useMemo(
    () =>
      new Set(
        Object.values(sessionTable)
          .filter((session) => session.sessionGroupId === sessionGroupId)
          .map((session) => session.id),
      ),
    [sessionTable, sessionGroupId],
  );
  const artifactIds = useMemo(
    () =>
      Object.values(artifactTable)
        .filter((artifact) => groupSessionIds.has(artifact.sessionId))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((artifact) => artifact.id),
    [artifactTable, groupSessionIds],
  );

  const selected = selectedId ? artifactTable[selectedId] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Back to artifacts"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {selected ? artifactDisplay(selected.type).label : "Artifacts"}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? `${selected.key} · ${selected.manifest.files.length} ${
                  selected.manifest.files.length === 1 ? "file" : "files"
                }`
              : "Everything published by the sessions in this group."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] min-h-[16rem] overflow-y-auto">
          {selected ? (
            <ArtifactContent artifact={selected} />
          ) : artifactIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Plans, images, and other files published by these sessions will appear here.
            </p>
          ) : (
            <div className="grid gap-4 pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {artifactIds.map((artifactId) => (
                <ArtifactGalleryCard
                  key={artifactId}
                  artifactId={artifactId}
                  onOpen={setSelectedId}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
