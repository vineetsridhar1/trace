import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft } from "lucide-react";
import type { Artifact } from "@trace/gql";
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
  query SessionGroupArtifactPage(
    $sessionGroupId: ID!
    $limit: Int!
    $before: DateTime
    $beforeId: ID
  ) {
    artifactPage(
      sessionGroupId: $sessionGroupId
      limit: $limit
      before: $before
      beforeId: $beforeId
    ) {
      hasMore
      items {
        id
        organizationId
        sessionId
        type
        key
        bundleDigest
        byteSize
        createdAt
        approvalStatus
        approvalAction
        approvedAt
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
  }
`;

const PAGE_SIZE = 50;
type PageArtifact = Pick<
  Artifact,
  | "id"
  | "organizationId"
  | "sessionId"
  | "type"
  | "key"
  | "bundleDigest"
  | "byteSize"
  | "createdAt"
  | "approvalStatus"
  | "approvalAction"
  | "approvedAt"
  | "manifest"
> & { session: { id: string; name: string; sessionGroupId?: string | null } };

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
  const patch = useEntityStore((state) => state.patch);
  const [artifactIds, setArtifactIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useEntityStore((state) =>
    selectedId ? state.artifacts[selectedId] : undefined,
  );
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnCount, setColumnCount] = useState(3);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ createdAt: string; id: string } | null>(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const activeGroupRef = useRef(sessionGroupId);

  const loadPage = useCallback(
    async (append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      const requestedGroupId = sessionGroupId;
      const cursor = append ? cursorRef.current : null;
      const result = await client
        .query(
          GROUP_ARTIFACTS_QUERY,
          {
            sessionGroupId,
            limit: PAGE_SIZE,
            before: cursor?.createdAt ?? null,
            beforeId: cursor?.id ?? null,
          },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      if (requestIdRef.current !== requestId) return;
      loadingRef.current = false;
      if (activeGroupRef.current !== requestedGroupId) return;
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const page = result.data?.artifactPage as
        | { items: PageArtifact[]; hasMore: boolean }
        | undefined;
      const items = page?.items ?? [];
      for (const artifact of items) {
        patch("sessions", artifact.session.id, artifact.session);
      }
      upsertMany("artifacts", items as unknown as Artifact[]);
      const last = items[items.length - 1];
      if (last) cursorRef.current = { createdAt: last.createdAt, id: last.id };
      setArtifactIds((current) => {
        const next = append ? [...current] : [];
        const seen = new Set(next);
        for (const artifact of items) {
          if (!seen.has(artifact.id)) next.push(artifact.id);
          seen.add(artifact.id);
        }
        return next;
      });
      setHasMore(page?.hasMore ?? false);
    },
    [patch, sessionGroupId, upsertMany],
  );

  useEffect(() => {
    if (!open) {
      activeGroupRef.current = "";
      requestIdRef.current += 1;
      loadingRef.current = false;
      return;
    }
    activeGroupRef.current = sessionGroupId;
    requestIdRef.current += 1;
    loadingRef.current = false;
    cursorRef.current = null;
    setArtifactIds([]);
    setSelectedId(null);
    setHasMore(false);
    setError(null);
    void loadPage(false);
    // Reset and fetch only when the dialog target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionGroupId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () =>
      setColumnCount(element.clientWidth < 640 ? 1 : element.clientWidth < 900 ? 2 : 3);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  const rows = useMemo(
    () =>
      Array.from({ length: Math.ceil(artifactIds.length / columnCount) }, (_, index) =>
        artifactIds.slice(index * columnCount, (index + 1) * columnCount),
      ),
    [artifactIds, columnCount],
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 260,
    overscan: 2,
  });
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
        <div ref={scrollRef} className="max-h-[70vh] min-h-[16rem] overflow-y-auto">
          {selected ? (
            <ArtifactContent artifact={selected} />
          ) : error && artifactIds.length === 0 ? (
            <div className="rounded-lg border border-destructive/50 p-6 text-sm">
              <p className="text-destructive">Artifacts could not be loaded.</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void loadPage(false)}
              >
                Retry
              </Button>
            </div>
          ) : !loading && artifactIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Plans, images, and other files published by these sessions will appear here.
            </p>
          ) : (
            <>
              <div className="relative pr-1" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 grid w-full gap-4 pb-4"
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {rows[virtualRow.index].map((artifactId) => (
                      <ArtifactGalleryCard
                        key={artifactId}
                        artifactId={artifactId}
                        onOpen={setSelectedId}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {(hasMore || loading || error) && (
                <div className="flex flex-col items-center gap-2 py-3">
                  {error && (
                    <p className="text-sm text-destructive">The next page could not be loaded.</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading}
                    onClick={() => void loadPage(true)}
                  >
                    {loading ? "Loading…" : error ? "Retry" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
