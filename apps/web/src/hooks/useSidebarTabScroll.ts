import { useCallback, useEffect, useRef } from "react";
import { clamp, type SidebarTab } from "../components/sidebar/sidebarTabs";
import { getNextWheelSamples, isMomentumTail, supportsScrollEnd, type WheelSample } from "./sidebarTabScrollUtils";
import { useSidebarTabMotion } from "./useSidebarTabMotion";

const FALLBACK_SCROLL_END_MS = 160;
const MOMENTUM_LOCK_MS = 180;

export function useSidebarTabScroll({
  currentTab,
  enabled = true,
  onProgressChange,
  onTabCommit,
}: {
  currentTab: SidebarTab;
  enabled?: boolean;
  onProgressChange?: (progress: number) => void;
  onTabCommit?: (tab: SidebarTab) => void;
}) {
  const fallbackScrollEndRef = useRef<number | null>(null);
  const wheelSamplesRef = useRef<WheelSample[]>([]);
  const momentumDirectionRef = useRef(0);
  const momentumLockUntilRef = useRef(0);
  const canUseScrollEndRef = useRef(supportsScrollEnd());

  const {
    cancelScrollAnimation,
    jumpToTab: jumpToMotionTab,
    scrollToTab,
    settleToNearestTab,
    syncTabProgress,
    tabProgress,
    viewportRef,
  } = useSidebarTabMotion({ currentTab, onProgressChange, onTabCommit });

  const clearFallbackScrollEnd = useCallback(() => {
    if (fallbackScrollEndRef.current !== null) {
      window.clearTimeout(fallbackScrollEndRef.current);
      fallbackScrollEndRef.current = null;
    }
  }, []);

  const resetWheelState = useCallback(() => {
    wheelSamplesRef.current = [];
    momentumDirectionRef.current = 0;
    momentumLockUntilRef.current = 0;
  }, []);

  const scheduleFallbackScrollEnd = useCallback(() => {
    if (canUseScrollEndRef.current) return;

    clearFallbackScrollEnd();
    fallbackScrollEndRef.current = window.setTimeout(() => {
      fallbackScrollEndRef.current = null;
      settleToNearestTab();
    }, FALLBACK_SCROLL_END_MS);
  }, [clearFallbackScrollEnd, settleToNearestTab]);

  const handleScroll = useCallback(() => {
    syncTabProgress();
    if (enabled) scheduleFallbackScrollEnd();
  }, [enabled, scheduleFallbackScrollEnd, syncTabProgress]);

  const handleTrackpadWheel = useCallback((event: WheelEvent) => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;

    const horizontalDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0;

    if (horizontalDelta === 0) return;

    event.preventDefault();
    cancelScrollAnimation();

    const now = performance.now();
    const direction = Math.sign(horizontalDelta);

    if (direction !== 0 && now < momentumLockUntilRef.current && direction === momentumDirectionRef.current) {
      scheduleFallbackScrollEnd();
      return;
    }

    if (now >= momentumLockUntilRef.current) {
      momentumDirectionRef.current = 0;
      momentumLockUntilRef.current = 0;
    }

    const delta = Math.abs(horizontalDelta);
    const nextSamples = getNextWheelSamples(wheelSamplesRef.current, direction, delta, now);
    wheelSamplesRef.current = nextSamples;

    if (isMomentumTail(nextSamples)) {
      momentumDirectionRef.current = direction;
      momentumLockUntilRef.current = now + MOMENTUM_LOCK_MS;
      settleToNearestTab();
      return;
    }

    viewport.scrollLeft = clamp(viewport.scrollLeft + horizontalDelta, 0, viewport.clientWidth);
    syncTabProgress();
    scheduleFallbackScrollEnd();
  }, [cancelScrollAnimation, enabled, scheduleFallbackScrollEnd, settleToNearestTab, syncTabProgress, viewportRef]);

  const selectTab = useCallback((tab: SidebarTab) => {
    clearFallbackScrollEnd();
    resetWheelState();
    scrollToTab(tab, "smooth", true);
  }, [clearFallbackScrollEnd, resetWheelState, scrollToTab]);

  const jumpToTab = useCallback((tab: SidebarTab) => {
    clearFallbackScrollEnd();
    resetWheelState();
    jumpToMotionTab(tab);
  }, [clearFallbackScrollEnd, jumpToMotionTab, resetWheelState]);

  const handleTouchStart = useCallback(() => {
    clearFallbackScrollEnd();
    cancelScrollAnimation();
    resetWheelState();
  }, [cancelScrollAnimation, clearFallbackScrollEnd, resetWheelState]);

  const handleTouchEnd = useCallback(() => {
    clearFallbackScrollEnd();
    settleToNearestTab();
  }, [clearFallbackScrollEnd, settleToNearestTab]);

  useEffect(() => {
    clearFallbackScrollEnd();
    resetWheelState();
  }, [clearFallbackScrollEnd, currentTab, resetWheelState]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;

    viewport.addEventListener("wheel", handleTrackpadWheel, { passive: false });

    if (canUseScrollEndRef.current) {
      viewport.addEventListener("scrollend", settleToNearestTab as EventListener);
    }

    return () => {
      viewport.removeEventListener("wheel", handleTrackpadWheel);
      if (canUseScrollEndRef.current) {
        viewport.removeEventListener("scrollend", settleToNearestTab as EventListener);
      }
    };
  }, [enabled, handleTrackpadWheel, settleToNearestTab, viewportRef]);

  useEffect(() => {
    return () => clearFallbackScrollEnd();
  }, [clearFallbackScrollEnd]);

  return {
    handleScroll,
    handleTouchEnd,
    handleTouchStart,
    jumpToTab,
    selectTab,
    settleToNearestTab,
    tabProgress,
    viewportRef,
  };
}
