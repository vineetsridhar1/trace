import type { DesignSystem } from "@trace/gql";

export function DesignSystemStatus({ system }: { system: DesignSystem }) {
  const artifact =
    system.commitArtifactStatus === "saving" || system.commitArtifactStatus === "pending"
      ? "Saving"
      : system.commitArtifactStatus === "failed"
        ? "Save failed"
        : system.commitArtifactStatus === "saved"
          ? "Cloud saved"
          : "Not saved";
  const publish =
    system.publishStatus === "publishing"
      ? "Publishing"
      : system.publishStatus === "failed"
        ? "Publish failed"
        : system.status === "ready"
          ? `Ready · v${system.activeVersion?.version ?? "–"}`
          : system.status;
  return (
    <span className="text-xs text-muted-foreground">
      {artifact} · {publish}
    </span>
  );
}
