import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { Tooltip, ImageLightbox } from '@trace/shared-ui';
import type { AttachedImage } from '../hooks/useImageAttachments';

interface WebImageThumbnailsProps {
  images: AttachedImage[];
  onRemove: (id: string) => void;
  uploading?: boolean;
}

export function WebImageThumbnails({ images, onRemove, uploading }: WebImageThumbnailsProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (images.length === 0 && !uploading) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
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
        {uploading && (
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-edge">
            <svg
              className="h-4 w-4 animate-spin text-muted"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
              />
            </svg>
          </div>
        )}
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
