import { useEffect, useCallback } from "react";
import { useIsMobile } from "../../hooks/use-mobile";
import { SessionDetailView } from "./SessionDetailView";
import { cn } from "../../lib/utils";

export function SessionPanel({
  sessionId,
  isFullscreen,
  onClose,
  onToggleFullscreen,
}: {
  sessionId: string;
  isFullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const isMobile = useIsMobile();

  // Escape key closes panel (or exits fullscreen first)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isFullscreen) {
          onToggleFullscreen();
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isFullscreen, onClose, onToggleFullscreen]);

  if (isMobile) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background",
          "translate-x-0 transition-transform duration-300 ease-out",
        )}
      >
        <SessionDetailView
          sessionId={sessionId}
          panelMode
          onClose={onClose}
          onToggleFullscreen={onToggleFullscreen}
        />
      </div>
    );
  }

  return (
    <SessionDetailView
      sessionId={sessionId}
      panelMode
      isFullscreen={isFullscreen}
      onClose={onClose}
      onToggleFullscreen={onToggleFullscreen}
    />
  );
}

/**
 * Wrapper that renders the session panel card alongside the main content card.
 * On desktop: a separate card that sits next to the main content.
 * On mobile: a fixed full-screen overlay.
 *
 * The parent must be a flex container. This component controls the panel card's
 * width via CSS transitions — no framer-motion needed.
 */
export function SessionPanelSlot({
  sessionId,
  isFullscreen,
  onClose,
  onToggleFullscreen,
}: {
  sessionId: string | null;
  isFullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const isMobile = useIsMobile();
  const hasSession = !!sessionId;

  // On mobile, render as a fixed overlay outside the flex layout
  if (isMobile && hasSession && sessionId) {
    return (
      <SessionPanel
        sessionId={sessionId}
        isFullscreen={false}
        onClose={onClose}
        onToggleFullscreen={onToggleFullscreen}
      />
    );
  }

  // Desktop: always render the card container so CSS can transition its width.
  // When no session, width collapses to 0. When session, expands to target width.
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-tl-lg rounded-tr-lg bg-background transition-all duration-300 ease-out",
        hasSession
          ? "flex-[1.2_1_0%] border opacity-100"
          : "flex-[0_0_0%] border-transparent opacity-0",
        hasSession && isFullscreen && "flex-[1_1_0%]",
      )}
    >
      {sessionId && (
        <div className="h-full min-w-[400px]">
          <SessionPanel
            sessionId={sessionId}
            isFullscreen={isFullscreen}
            onClose={onClose}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      )}
    </div>
  );
}
