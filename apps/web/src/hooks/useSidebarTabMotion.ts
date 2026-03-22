import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, getTabFromProgress, getTabIndex, type SidebarTab } from "../components/sidebar/sidebarTabs";

const SNAP_DURATION_MS = 72;

export function useSidebarTabMotion({
  currentTab,
  onProgressChange,
  onTabCommit,
}: {
  currentTab: SidebarTab;
  onProgressChange?: (progress: number) => void;
  onTabCommit?: (tab: SidebarTab) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const tabProgressRef = useRef(getTabIndex(currentTab));
  const targetTabRef = useRef<SidebarTab>(currentTab);
  const [tabProgress, setTabProgressState] = useState(getTabIndex(currentTab));

  const setTabProgress = useCallback((nextProgress: number) => {
    const clampedProgress = clamp(nextProgress, 0, 1);
    tabProgressRef.current = clampedProgress;
    setTabProgressState(clampedProgress);
    onProgressChange?.(clampedProgress);
  }, [onProgressChange]);

  const cancelScrollAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const readProgress = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return tabProgressRef.current;

    return clamp(viewport.scrollLeft / Math.max(viewport.clientWidth, 1), 0, 1);
  }, []);

  const syncTabProgress = useCallback(() => {
    setTabProgress(readProgress());
  }, [readProgress, setTabProgress]);

  const scrollToTab = useCallback((tab: SidebarTab, behavior: ScrollBehavior = "smooth", commit = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    targetTabRef.current = tab;
    if (commit) onTabCommit?.(tab);

    cancelScrollAnimation();

    const targetIndex = getTabIndex(tab);
    const targetLeft = viewport.clientWidth * targetIndex;

    if (behavior === "auto") {
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
      return;
    }

    const startLeft = viewport.scrollLeft;
    const distance = targetLeft - startLeft;

    if (Math.abs(distance) < 0.5) {
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
      return;
    }

    const startTime = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / SNAP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      viewport.scrollLeft = startLeft + distance * eased;
      setTabProgress(viewport.scrollLeft / Math.max(viewport.clientWidth, 1));

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animationFrameRef.current = null;
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelScrollAnimation, onTabCommit, setTabProgress]);

  const settleToNearestTab = useCallback(() => {
    const nextTab = getTabFromProgress(readProgress());
    const targetIndex = getTabIndex(nextTab);

    if (Math.abs(tabProgressRef.current - targetIndex) < 0.01 && targetTabRef.current === nextTab) {
      setTabProgress(targetIndex);
      return;
    }

    scrollToTab(nextTab, "smooth", true);
  }, [readProgress, scrollToTab, setTabProgress]);

  const jumpToTab = useCallback((tab: SidebarTab) => {
    scrollToTab(tab, "auto");
  }, [scrollToTab]);

  useEffect(() => {
    const targetIndex = getTabIndex(currentTab);

    if (!hasInitializedRef.current) {
      jumpToTab(currentTab);
      hasInitializedRef.current = true;
      return;
    }

    if (Math.abs(tabProgressRef.current - targetIndex) < 0.01 && targetTabRef.current === currentTab) {
      return;
    }

    scrollToTab(currentTab, "smooth");
  }, [currentTab, jumpToTab, scrollToTab]);

  useEffect(() => {
    const handleResize = () => {
      jumpToTab(targetTabRef.current);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [jumpToTab]);

  useEffect(() => {
    return () => cancelScrollAnimation();
  }, [cancelScrollAnimation]);

  return {
    cancelScrollAnimation,
    jumpToTab,
    readProgress,
    scrollToTab,
    settleToNearestTab,
    syncTabProgress,
    tabProgress,
    viewportRef,
  };
}

