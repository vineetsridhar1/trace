import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function ImageLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? "Image viewer"}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/80" onClick={onClose} aria-hidden="true" />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 cursor-pointer"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt ?? "Image"}
        className="relative z-10 max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
      />
    </div>,
    document.body,
  );
}
