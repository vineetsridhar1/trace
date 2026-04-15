import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { ImageLightbox } from "./ImageLightbox";

export interface ImageAttachment {
  id: string;
  file: File;
  previewUrl: string;
  s3Key: string | null;
  uploading: boolean;
}

export function ImageAttachmentBar({
  images,
  onRemove,
}: {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
}) {
  const [lightboxImage, setLightboxImage] = useState<ImageAttachment | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 px-2 pt-2 pb-1 overflow-x-auto">
        <AnimatePresence>
          {images.map((img) => (
            <motion.div
              key={img.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="relative shrink-0 group"
            >
              <motion.img
                layoutId={`attachment-${img.id}`}
                src={img.previewUrl}
                alt="Attachment"
                className="h-16 w-16 rounded-md object-cover cursor-pointer border border-border"
                onClick={() => setLightboxImage(img)}
              />
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
                  <Loader2 size={16} className="animate-spin text-white" />
                </div>
              )}
              <button
                onClick={() => onRemove(img.id)}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-surface-elevated border border-border p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.previewUrl}
          alt="Attachment"
          open={!!lightboxImage}
          onClose={() => setLightboxImage(null)}
          layoutId={`attachment-${lightboxImage.id}`}
        />
      )}
    </>
  );
}
