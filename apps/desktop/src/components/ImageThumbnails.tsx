import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { AttachedImage } from '../hooks/useImageAttachments';
import { ImageLightbox } from './ImageLightbox';

interface ImageThumbnailsProps {
  images: AttachedImage[];
  onRemove: (id: string) => void;
}

export function ImageThumbnails({ images, onRemove }: ImageThumbnailsProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 px-1 pb-2">
        {images.map((img) => (
          <div key={img.id} className="group relative">
            <button
              type="button"
              onClick={() => setLightboxSrc(img.previewUrl)}
              className="h-12 w-12 overflow-hidden rounded-md border border-edge transition-colors hover:border-accent/60"
            >
              <img
                src={img.previewUrl}
                alt={img.filename}
                className="h-full w-full object-cover"
              />
            </button>
            <Tooltip text="Remove" position="bottom">
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-elevated text-muted opacity-0 transition-opacity hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
              >
                <FiX className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Attached image"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </>
  );
}
