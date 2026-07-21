import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { useComposerStore } from "../../stores/composer";
import { Button } from "../ui/button";
import { DesignSystemHistoryDialog } from "./DesignSystemHistoryDialog";
import { DesignSystemSaveButton } from "./DesignSystemSaveButton";
import { DesignSystemStatus } from "./DesignSystemStatus";

const RETRY = gql`
  mutation RetryDesignSystemCommit($designSystemId: ID!) {
    retryDesignSystemCommitArtifact(designSystemId: $designSystemId) {
      id
      commitArtifactStatus
    }
  }
`;
const REFRESH_SOURCE = gql`
  mutation RefreshDesignSystemSource($id: ID!) {
    refreshDesignSystemSource(id: $id) {
      id
      sourceCommitSha
      updatedAt
    }
  }
`;
const ARCHIVE = gql`
  mutation ArchiveDesignSystem($id: ID!) {
    archiveDesignSystem(id: $id) {
      id
      status
      archivedAt
    }
  }
`;
export function DesignSystemWorkbenchToolbar({
  sessionGroupId,
  sessionId,
  agentIdle,
}: {
  sessionGroupId: string;
  sessionId: string | null;
  agentIdle: boolean;
}) {
  const system = useEntityStore((state) =>
    Object.values(state.designSystems).find(
      (item) => item.authoringSessionGroupId === sessionGroupId,
    ),
  );
  const requestPrefill = useComposerStore((state) => state.requestPrefill);
  if (!system) return null;
  const refreshSource = async () => {
    if (!sessionId) return;
    const result = await client.mutation(REFRESH_SOURCE, { id: system.id }).toPromise();
    if (result.error) {
      toast.error("Could not refresh source", { description: result.error.message });
      return;
    }
    requestPrefill(
      sessionId,
      `Refresh the read-only source checkout for ${system.sourceRepo?.name ?? "the source repository"} at ${system.sourceBranch ?? "its configured branch"}, compare it with source/evidence.json, and show the resulting package and canvas changes for review. Do not publish a version.`,
      false,
    );
    toast.success("Source checkout refreshed", {
      description: "Review and send the prepared comparison request.",
    });
  };
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-border bg-surface-deep px-4">
      <div className="min-w-0 flex-1">
        <span className="mr-3 text-sm font-medium">{system.name}</span>
        <DesignSystemStatus system={system} />
        {system.publishError || system.commitArtifactError ? (
          <span className="ml-3 text-xs text-destructive">
            {system.publishError ?? system.commitArtifactError}
          </span>
        ) : null}
        <p className="truncate text-[11px] text-muted-foreground">
          {system.sourceRepo?.name ?? "Source unavailable"}
          {system.sourceBranch ? ` · ${system.sourceBranch}` : ""}
          {system.sourcePath ? `/${system.sourcePath}` : ""}
          {system.sourceCommitSha
            ? ` · ${system.sourceCommitSha.slice(0, 8)}`
            : system.sourceRepoId
              ? " · refreshing…"
              : ""}
        </p>
      </div>
      {system.commitArtifactStatus === "failed" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void client
              .mutation(RETRY, { designSystemId: system.id })
              .toPromise()
              .then(
                (result) =>
                  result.error &&
                  toast.error("Retry failed", { description: result.error.message }),
              )
          }
        >
          Retry cloud save
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={!sessionId || !system.sourceRepoId}
        onClick={() => void refreshSource()}
      >
        Refresh source
      </Button>
      <DesignSystemHistoryDialog designSystemId={system.id} />
      <DesignSystemSaveButton system={system} agentIdle={agentIdle} />
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          void client
            .mutation(ARCHIVE, { id: system.id })
            .toPromise()
            .then((result) =>
              result.error
                ? toast.error("Archive failed", { description: result.error.message })
                : toast.success("Design system archived"),
            )
        }
      >
        Archive
      </Button>
    </div>
  );
}
