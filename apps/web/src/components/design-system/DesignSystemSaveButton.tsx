import { gql } from "@urql/core";
import type { DesignSystem } from "@trace/gql";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";

const SAVE_DESIGN_SYSTEM = gql`
  mutation SaveDesignSystem($id: ID!) {
    saveDesignSystem(id: $id) {
      id
      version
    }
  }
`;
export function DesignSystemSaveButton({
  system,
  agentIdle,
}: {
  system: DesignSystem;
  agentIdle: boolean;
}) {
  const artifact = system.latestCommitArtifact;
  const enabled =
    agentIdle &&
    artifact?.status === "saved" &&
    artifact.packageValid === true &&
    artifact.commitSha === system.latestPushedCommitSha &&
    system.publishStatus !== "publishing";
  return (
    <Button
      size="sm"
      disabled={!enabled}
      onClick={() =>
        void client
          .mutation(SAVE_DESIGN_SYSTEM, { id: system.id })
          .toPromise()
          .then((result) =>
            result.error
              ? toast.error("Could not publish design system", {
                  description: result.error.message,
                })
              : toast.success("Design system published"),
          )
      }
    >
      {system.publishStatus === "publishing" ? "Saving…" : "Save"}
    </Button>
  );
}
