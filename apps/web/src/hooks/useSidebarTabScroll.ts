import { useCallback, useEffect, useRef, useState } from "react";
import createScrollSnap from "scroll-snap/dist/scroll-snap.esm.js";
import { clamp } from "../lib/utils";
import { getTabFromProgress, getTabIndex, type SidebarTab } from "../components/sidebar/sidebarTabs";

const SNAP_DURATION_MS = 50;
const SNAP_TIMEOUT_MS = 80; // minimum the library allows is 50ms

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function useSidebarTabScroll({
  currentTab,
  onProgressChange,
  onTabCommit,
}: {
  currentTab: SidebarTab;
  onProgressChange?: (progress: number) => void;
  onTabCommit?: (tab: SidebarTab) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(getTabIndex(currentTab));
  const [tabProgress, setTabProgressState] = useState(getTabIndex(currentTab));
  const hasInitRef = useRef(false);

  const setProgress = useCallback((p: number) => {
    const clamped = clamp(p, 0, 1);
    progressRef.current = clamped;
    setTabProgressState(clamped);
    onProgressChange?.(clamped);
  }, [onProgressChange]);

  // Called by the library after each snap animation completes
  const commitPosition = useCallback(() => {
    const tab = getTabFromProgress(progressRef.current);
    onTabCommit?.(tab);
    setProgress(getTabIndex(tab));
  }, [onTabCommit, setProgress]);

  // Track scroll progress for background color blending
  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setProgress(viewport.scrollLeft / Math.max(viewport.clientWidth, 1));
  }, [setProgress]);

  // Bind scroll-snap to the viewport
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { unbind } = createScrollSnap(
      viewport,
      {
        snapDestinationX: "100%",
        duration: SNAP_DURATION_MS,
        timeout: SNAP_TIMEOUT_MS,
        snapStop: true,
        easing: easeInOut,
      },
      commitPosition,
    );

    return () => unbind();
  }, [commitPosition]);

  // Instant jump — used for init, resize, and external tab changes
  const jumpToTab = useCallback((tab: SidebarTab) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = getTabIndex(tab) * viewport.clientWidth;
    setProgress(getTabIndex(tab));
  }, [setProgress]);

  // Animated switch — used when user clicks the tab switcher.
  // scrollTo smooth lets the library detect scroll-end and run its snap animation.
  const selectTab = useCallback((tab: SidebarTab) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ left: getTabIndex(tab) * viewport.clientWidth, behavior: "smooth" });
  }, []);

  // Sync scroll position when currentTab changes externally
  useEffect(() => {
    if (!hasInitRef.current) {
      jumpToTab(currentTab);
      hasInitRef.current = true;
      return;
    }
    jumpToTab(currentTab);
  }, [currentTab, jumpToTab]);

  // Re-snap to current tab on resize
  useEffect(() => {
    const handleResize = () => jumpToTab(currentTab);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentTab, jumpToTab]);

  return { handleScroll, jumpToTab, selectTab, tabProgress, viewportRef };
}
