import { FileArchive, FileText, Image, Video, type LucideIcon } from "lucide-react";

const artifactTypeDetails: Record<string, { label: string; Icon: LucideIcon }> = {
  "trace.visual-plan.v1": { label: "Plan", Icon: FileText },
  "trace.image.v1": { label: "Image", Icon: Image },
  "trace.video.v1": { label: "Video", Icon: Video },
  "trace.document.v1": { label: "Document", Icon: FileText },
  "trace.file-bundle.v1": { label: "Files", Icon: FileArchive },
};

export function artifactDisplay(type: string): { label: string; Icon: LucideIcon } {
  return artifactTypeDetails[type] ?? { label: "Artifact", Icon: FileArchive };
}
