import { useState, useRef, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExpandIcon, X } from "lucide-react";
import { createPortal } from "react-dom";
import { navigateToSession } from "../../stores/ui";
import { SessionDetailView } from "../session/SessionDetailView";

interface SessionPreviewModalProps {
  sessionId: string;
  channelId: string;
  children: React.ReactNode;
}

export function SessionPreviewModal({ sessionId, channelId, children }: SessionPreviewModalProps) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  const handleGoToSession = useCallback(() => {
    setOpen(false);
    navigateToSession(channelId, sessionId);
  }, [channelId, sessionId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} className="cursor-pointer">
        {children}
      </div>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={handleClose}
              />

              {/* Modal */}
              <motion.div
                className="fixed z-50 rounded-2xl bg-background shadow-2xl overflow-hidden ring-1 ring-border"
                style={{ width: "90vw", height: "92vh", transformOrigin: "center center" }}
                initial={{
                  opacity: 0,
                  scale: 0,
                  left: origin.x,
                  top: origin.y,
                  x: "-50%",
                  y: "-50%",
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  left: "50%",
                  top: "50%",
                  x: "-50%",
                  y: "-50%",
                }}
                exit={{
                  opacity: 0,
                  scale: 0,
                  left: origin.x,
                  top: origin.y,
                  x: "-50%",
                  y: "-50%",
                }}
                transition={{ type: "spring", duration: 0.5 }}
              >
                <SessionDetailView sessionId={sessionId} />
              </motion.div>

              {/* Close button */}
              <motion.button
                className="fixed z-50 rounded-full p-2 bg-background hover:bg-muted shadow-lg ring-1 ring-border"
                style={{ top: "calc(4vh)", left: "calc(50% + 45vw + 12px)" }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: "spring", duration: 0.5, delay: 0.1 }}
                aria-label="Close"
                onClick={handleClose}
              >
                <X className="h-5 w-5" />
              </motion.button>

              {/* Go to session button */}
              <motion.button
                className="fixed z-50 rounded-full p-2 bg-background hover:bg-muted shadow-lg ring-1 ring-border"
                style={{ top: "calc(4vh + 44px)", left: "calc(50% + 45vw + 12px)" }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: "spring", duration: 0.5, delay: 0.1 }}
                aria-label="Go to session"
                onClick={handleGoToSession}
              >
                <ExpandIcon className="h-5 w-5" />
              </motion.button>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
