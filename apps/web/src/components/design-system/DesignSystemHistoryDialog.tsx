import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import type { DesignSystemCommitArtifact, DesignSystemVersion } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

const HISTORY = gql`
  query DesignSystemHistory($id: ID!) {
    designSystemCommitArtifacts(designSystemId: $id, first: 50) {
      edges {
        node {
          id
          designSystemId
          sequence
          commitSha
          status
          packageValid
          packageDigest
          byteSize
          error
          createdAt
          savedAt
        }
      }
    }
    designSystemVersions(designSystemId: $id) {
      id
      designSystemId
      version
      contentDigest
      byteSize
      sourceCommitSha
      workbenchCommitSha
      createdAt
    }
  }
`;

function shortSha(value: string | null | undefined): string {
  return value?.slice(0, 8) ?? "—";
}

export function DesignSystemHistoryDialog({ designSystemId }: { designSystemId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const artifacts = useEntityStore((state) =>
    Object.values(state.designSystemCommitArtifacts)
      .filter((item) => item.designSystemId === designSystemId)
      .sort((a, b) => b.sequence - a.sequence),
  );
  const versions = useEntityStore((state) =>
    Object.values(state.designSystemVersions)
      .filter((item) => item.designSystemId === designSystemId)
      .sort((a, b) => b.version - a.version),
  );
  const upsertMany = useEntityStore((state) => state.upsertMany);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void client
      .query(HISTORY, { id: designSystemId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        if (!result.error) {
          upsertMany(
            "designSystemCommitArtifacts",
            (result.data?.designSystemCommitArtifacts?.edges ?? []).map(
              (edge: { node: DesignSystemCommitArtifact }) => edge.node,
            ),
          );
          upsertMany(
            "designSystemVersions",
            (result.data?.designSystemVersions ?? []) as DesignSystemVersion[],
          );
        }
      })
      .finally(() => setLoading(false));
  }, [designSystemId, open, upsertMany]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>History</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Design system history</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto">
          <section>
            <h3 className="mb-2 text-sm font-medium">Published versions</h3>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No published versions yet.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-md border border-border p-2 text-xs"
                  >
                    <strong>v{version.version}</strong>
                    <span className="text-muted-foreground">
                      Workbench {shortSha(version.workbenchCommitSha)} · Source{" "}
                      {shortSha(version.sourceCommitSha)}
                    </span>
                    <time>{new Date(version.createdAt).toLocaleString()}</time>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-medium">Cloud commit artifacts</h3>
            {loading && artifacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : artifacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pushed commits yet.</p>
            ) : (
              <div className="space-y-2">
                {artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-md border border-border p-2 text-xs"
                  >
                    <strong>#{artifact.sequence}</strong>
                    <span>
                      <span className="text-muted-foreground">
                        {shortSha(artifact.commitSha)} · {artifact.status}
                      </span>
                      {artifact.packageValid === false ? (
                        <span className="ml-2 text-destructive">Package invalid</span>
                      ) : null}
                      {artifact.error ? (
                        <p className="mt-1 text-destructive">{artifact.error}</p>
                      ) : null}
                    </span>
                    <time>{new Date(artifact.createdAt).toLocaleString()}</time>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
