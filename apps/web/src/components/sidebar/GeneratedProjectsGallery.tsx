import { FileText, LayoutTemplate, Palette, Rocket, type LucideIcon } from "lucide-react";
import { useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { savedDesignPreviewUrl } from "../session/applications/saved-design-preview";
import type { GeneratedProjectKind } from "./generated-project-types";
import { usePdfArtifactPreviewUrls } from "./usePdfArtifactPreviewUrls";

const projectKindDetails = {
  app: { label: "App", Icon: Rocket },
  design: { label: "Design", Icon: LayoutTemplate },
  design_system: { label: "Design System", Icon: Palette },
  pdf: { label: "Document", Icon: FileText },
} as const;

export function GeneratedProjectsGallery() {
  const groups = useEntityStore((state) => state.sessionGroups);
  const projectGroups = Object.values(groups)
    .filter(
      (group) =>
        !group.archivedAt &&
        (group.kind === "app" ||
          group.kind === "design" ||
          group.kind === "design_system" ||
          group.kind === "pdf"),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const pdfGroups = projectGroups.filter((group) => group.kind === "pdf");
  const pdfPreviewUrls = usePdfArtifactPreviewUrls(pdfGroups);

  return (
    <div className="flex h-full flex-col">
      <header className="app-region-drag flex h-12 shrink-0 items-center border-b border-border py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
        <h2 className="text-sm font-semibold text-foreground">Create</h2>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-foreground">Your creations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Apps, designs, design systems, and documents created by your workspace.
            </p>
          </div>
          {projectGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Your generated projects will appear here.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectGroups.map((group) => (
                <GeneratedProjectGalleryCard
                  key={group.id}
                  group={group}
                  pdfPreviewUrl={pdfPreviewUrls[group.id]}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function GeneratedProjectGalleryCard({
  group,
  pdfPreviewUrl,
}: {
  group: SessionGroupEntity;
  pdfPreviewUrl: string | undefined;
}) {
  const kind = group.kind as GeneratedProjectKind;
  const { Icon, label } = projectKindDetails[kind];
  const designPreview = savedDesignPreviewUrl(
    group.designPreviewUrl as string | null | undefined,
    group.gitCheckpoints,
  );

  return (
    <button
      type="button"
      onClick={() => navigateToSessionGroup(null, group.id)}
      className="group overflow-hidden rounded-lg border border-border bg-surface-elevated text-left transition-colors hover:border-border hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="aspect-[16/10] overflow-hidden bg-surface-deep">
        {kind === "design" && designPreview ? (
          <iframe
            src={designPreview}
            title={`${group.name} preview`}
            className="pointer-events-none size-full border-0 bg-background"
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        ) : kind === "pdf" ? (
          <PdfArtifactPreview title={group.name} previewUrl={pdfPreviewUrl} />
        ) : (
          <ArtifactPlaceholder Icon={Icon} label={label} />
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {group.name}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </button>
  );
}

function PdfArtifactPreview({ title, previewUrl }: { title: string; previewUrl: string | undefined }) {
  if (!previewUrl) return <ArtifactPlaceholder Icon={FileText} label="Document" />;

  return (
    <iframe
      src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
      title={`${title} preview`}
      className="pointer-events-none size-full border-0 bg-background"
    />
  );
}

function ArtifactPlaceholder({
  Icon,
  label,
}: {
  Icon: LucideIcon;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-2 text-muted-foreground",
        "bg-[radial-gradient(rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:16px_16px]",
      )}
    >
      <Icon className="size-7" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
