import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "../../hooks/use-mobile";
import { SessionDetailView } from "./SessionDetailView";

const PANEL_SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

export function SessionPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [fullscreen, setFullscreen] = useState(false);

  if (fullscreen) {
    return (
      <motion.div
        key="fullscreen"
        className="fixed inset-0 z-50 bg-background"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <SessionDetailView
          sessionId={sessionId}
          panelMode
          isFullscreen
          onClose={onClose}
          onToggleFullscreen={() => setFullscreen(false)}
        />
      </motion.div>
    );
  }

  if (isMobile) {
    return (
      <motion.div
        key="mobile"
        className="fixed inset-0 z-40 bg-background"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={PANEL_SPRING}
      >
        <SessionDetailView
          sessionId={sessionId}
          panelMode
          onClose={onClose}
          onToggleFullscreen={() => setFullscreen(true)}
        />
      </motion.div>
    );
  }

  // Desktop: inline panel that pushes table content
  return (
    <motion.div
      key="desktop"
      className="h-full border-l border-border overflow-hidden flex-shrink-0"
      initial={{ width: 0 }}
      animate={{ width: "55%" }}
      exit={{ width: 0 }}
      transition={PANEL_SPRING}
    >
      <div className="h-full w-full min-w-[400px]">
        <SessionDetailView
          sessionId={sessionId}
          panelMode
          onClose={onClose}
          onToggleFullscreen={() => setFullscreen(true)}
        />
      </div>
    </motion.div>
  );
}

export function AnimatedSessionPanel({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {sessionId && (
        <SessionPanel
          key={sessionId}
          sessionId={sessionId}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}
