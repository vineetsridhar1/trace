import { useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { ImageLightbox } from "./ImageLightbox";

export interface FileAttachment {
  id: string;
  file: File;
  previewUrl: string;
  s3Key: string | null;
  uploading: boolean;
}

export function ImageAttachmentBar({
  attachments,
  onRemove,
}: {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
}) {
  const [lightboxImage, setLightboxImage] = useState<FileAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 px-2 pt-2 pb-1 overflow-x-auto">
        {attachments.map((attachment) => {
          const isImage = attachment.file.type.startsWith("image/");
          return (
            <div key={attachment.id} className="relative shrink-0 group">
              {isImage ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.file.name || "Attachment"}
                  className="h-16 w-16 rounded-md object-cover cursor-pointer border border-border"
                  onClick={() => setLightboxImage(attachment)}
                />
              ) : (
                <div className="flex h-16 w-44 items-center gap-2 rounded-md border border-border bg-surface-deep px-2 text-left">
                  <FileText size={18} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">
                      {attachment.file.name || "Attachment"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatFileSize(attachment.file.size)}
                    </div>
                  </div>
                </div>
              )}
              {attachment.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
                  <Loader2 size={16} className="animate-spin text-white" />
                </div>
              )}
              <button
                onClick={() => onRemove(attachment.id)}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-surface-elevated border border-border p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.previewUrl}
          alt="Attachment"
          open={!!lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ImageAttachment = FileAttachment;
