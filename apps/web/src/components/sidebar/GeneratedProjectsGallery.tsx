import {
  FileText,
  LayoutTemplate,
  MoreHorizontal,
  Palette,
  Rocket,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { useState } from "react";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { savedDesignPreviewUrl } from "../session/applications/saved-design-preview";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import type { GeneratedProjectKind } from "./generated-project-types";
import { usePdfArtifactPreviewUrls } from "./usePdfArtifactPreviewUrls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const ARCHIVE_DESIGN_SYSTEM = gql`
  mutation ArchiveDesignSystemFromGallery($id: ID!) {
    archiveDesignSystem(id: $id) {
      id
      archivedAt
    }
  }
`;

const projectKindDetails = {
  app: { label: "App", Icon: Rocket },
  design: { label: "Design", Icon: LayoutTemplate },
  design_system: { label: "Design System", Icon: Palette },
  pdf: { label: "Document", Icon: FileText },
} as const;

export function GeneratedProjectsGallery() {
  const groups = useEntityStore((state) => state.sessionGroups);
  const visibleGroups = Object.values(groups)
    .filter(
      (group) =>
        !group.archivedAt &&
        (group.kind === "app" ||
          group.kind === "design" ||
          group.kind === "design_system" ||
          group.kind === "pdf"),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const projectGroups = visibleGroups.filter((group) => group.kind !== "design_system");
  const designSystemGroups = visibleGroups.filter((group) => group.kind === "design_system");
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
              Apps, designs, and documents created by your workspace.
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
          <Accordion className="mt-10 border-t border-border">
            <AccordionItem value="design-systems" className="border-b-0">
              <AccordionTrigger className="py-5 hover:no-underline">
                <span className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">Design systems</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {designSystemGroups.length === 1
                      ? "1 shared system"
                      : `${designSystemGroups.length} shared systems`}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {designSystemGroups.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Your design systems will appear here.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {designSystemGroups.map((group) => (
                      <GeneratedProjectGalleryCard key={group.id} group={group} />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
  pdfPreviewUrl?: string;
}) {
  const kind = group.kind as GeneratedProjectKind;
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const designSystem = useEntityStore((state) =>
    kind === "design_system"
      ? Object.values(state.designSystems).find(
          (system) => system.authoringSessionGroupId === group.id,
        )
      : undefined,
  );
  const { Icon, label } = projectKindDetails[kind];
  const designPreview = savedDesignPreviewUrl(
    group.designPreviewUrl as string | null | undefined,
    group.gitCheckpoints,
  );

  const [archiving, setArchiving] = useState(false);

  const archiveDesignSystem = async () => {
    setArchiving(true);
    try {
      if (!designSystem) {
        toast.error("Could not delete design system", {
          description: "The design system record is still loading. Try again.",
        });
        return;
      }
      const result = await client
        .mutation(ARCHIVE_DESIGN_SYSTEM, { id: designSystem.id })
        .toPromise();
      if (result.error) {
        toast.error("Could not delete design system", { description: result.error.message });
      } else {
        upsertMany("sessionGroups", [{ ...group, archivedAt: new Date().toISOString() }]);
      }
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface-elevated text-left transition-colors hover:border-border hover:bg-surface-hover">
      <button
        type="button"
        onClick={() => navigateToSessionGroup(null, group.id)}
        className="block w-full text-left focus-visible:ring-2 focus-visible:ring-ring"
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
      {kind === "design_system" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${group.name}`}
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={archiving || !designSystem}
              onClick={() => void archiveDesignSystem()}
            >
              <Trash2 className="size-4" />
              {archiving ? "Deleting…" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function PdfArtifactPreview({
  title,
  previewUrl,
}: {
  title: string;
  previewUrl: string | undefined;
}) {
  if (!previewUrl) return <ArtifactPlaceholder Icon={FileText} label="Document" />;

  return (
    <iframe
      src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
      title={`${title} preview`}
      className="pointer-events-none size-full border-0 bg-background"
    />
  );
}

function ArtifactPlaceholder({ Icon, label }: { Icon: LucideIcon; label: string }) {
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
