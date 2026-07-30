import { useMemo, memo } from "react";
import { Plus } from "lucide-react";
import { useAuthStore, useEntityStore } from "@trace/client-core";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { useHomeDataStore } from "../../stores/home-data";
import { Button } from "../ui/button";
import { GeneratedDesignSystemsGallery } from "./GeneratedDesignSystemsGallery";
import { GeneratedProjectGalleryCard } from "./GeneratedProjectGalleryCard";
import { usePdfArtifactPreviewUrls } from "./usePdfArtifactPreviewUrls";

export const GeneratedProjectsGallery = memo(function GeneratedProjectsGallery() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const groups = useEntityStore((state) => state.sessionGroups);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const generatedStatus = useHomeDataStore((state) =>
    state.organizationId === activeOrgId ? state.generatedStatus : "idle",
  );
  const retryHomeData = useHomeDataStore((state) => state.requestRetry);
  const visibleGroups = useMemo(
    () =>
      Object.values(groups)
        .filter(
          (group) =>
            !group.archivedAt &&
            (group.kind === "app" ||
              group.kind === "design" ||
              group.kind === "pdf" ||
              group.kind === "animation"),
        )
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [groups],
  );
  const pdfGroups = visibleGroups.filter((group) => group.kind === "pdf");
  const pdfPreviewUrls = usePdfArtifactPreviewUrls(pdfGroups);

  return (
    <section className="mx-auto mt-12 w-full max-w-7xl border-t border-[var(--th-edge)] pt-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your creations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Apps, designs, documents, animations, and design systems from your workspace.
          </p>
        </div>
        <Button onClick={() => openGeneratedProjectDialog("choose")}>
          <Plus className="size-4" />
          Create new
        </Button>
      </div>
      {generatedStatus === "error" && visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-[var(--th-edge)] bg-[var(--th-surface)] p-6 text-sm text-muted-foreground">
          <p>Creations could not be loaded.</p>
          <button
            type="button"
            onClick={retryHomeData}
            className="mt-3 text-xs font-medium text-[var(--th-accent-light)] hover:text-foreground"
          >
            Try again
          </button>
        </div>
      ) : generatedStatus !== "ready" && visibleGroups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Loading creations…
        </p>
      ) : visibleGroups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Your generated projects will appear here.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleGroups.map((group) => (
            <GeneratedProjectGalleryCard
              key={group.id}
              group={group}
              pdfPreviewUrl={pdfPreviewUrls[group.id]}
            />
          ))}
        </div>
      )}
      <GeneratedDesignSystemsGallery />
    </section>
  );
});
