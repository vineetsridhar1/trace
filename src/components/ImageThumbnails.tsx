import { useState } from 'react';
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
              className="h-12 w-12 overflow-hidden rounded-md border border-[#292e42] transition-colors hover:border-violet-500/60"
            >
              <img
                src={img.previewUrl}
                alt={img.filename}
                className="h-full w-full object-cover"
              />
            </button>
            <button
              type="button"
              onClick={() => onRemove(img.id)}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#292e42] text-[#565f89] opacity-0 transition-opacity hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
            >
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
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
