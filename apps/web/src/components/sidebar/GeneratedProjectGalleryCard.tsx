import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import {
  FileText,
  LayoutTemplate,
  MoreHorizontal,
  Palette,
  Rocket,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { savedDesignPreviewUrl } from "../session/applications/saved-design-preview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { GeneratedProjectKind } from "./generated-project-types";

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
  animation: { label: "Animation", Icon: Sparkles },
} as const;

export function GeneratedProjectGalleryCard({
  group,
  pdfPreviewUrl,
}: {
  group: SessionGroupEntity;
  pdfPreviewUrl?: string;
}) {
  const kind = group.kind as GeneratedProjectKind;
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
