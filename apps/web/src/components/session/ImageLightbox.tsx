import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export function ImageLightbox({
  src,
  alt,
  open,
  onClose,
  layoutId,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
  layoutId?: string;
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={alt ?? "Image viewer"}
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/80" onClick={onClose} aria-hidden="true" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
          >
            <X size={20} />
          </button>
          <motion.img
            layoutId={layoutId}
            src={src}
            alt={alt ?? "Image"}
            className="relative z-10 max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
